// Calendar-aware analyzer: nudge the subject's lists into the right shape
// for each upcoming auto-archive event. Fully deterministic; never reads
// `giftedItems` (claim data) so the spoiler-protection invariant holds.
//
// Per event in window, walks a decision tree and emits at most one of:
//
//   1. `convert-public-list` (important): subject has a public list whose
//      type isn't in the event's match set; rename + convert to the
//      canonical event type. Only fires when the conversion doesn't break
//      coverage of another in-window event.
//
//   2. `make-private-list-public` (suggest): subject has a private list
//      that already matches the event; just flip its privacy.
//
//   3. `create-event-list` (suggest): subject has no list matching the
//      event at all; scaffold a new private one (privacy is "not ready
//      yet"; user can flip to public via branch 2 in a later run after
//      adding items).
//
// Independent of the three above, for user-subject runs only:
//
//   4. `wrong-primary-for-event` (suggest): the event's matching list
//      exists but isn't primary, and some OTHER list is primary. Rotate.
//      Dependent runs skip this branch — `lists.isPrimary` is per-owner,
//      not per-(owner, dependent).

import { and, asc, desc, eq, isNull, ne } from 'drizzle-orm'

import { lists } from '@/db/schema'
import type { ListType } from '@/db/schema/enums'

import type { Analyzer } from '../analyzer'
import { combineHashes, sha256Hex } from '../hash'
import type { AnalyzerRecOutput, AnalyzerResult, AnalyzerStep, ListRef } from '../types'
import { eventIsCovered, getInWindowEventsForSubject, type InWindowEvent } from '../upcoming-events'

// ─── Rename rule ────────────────────────────────────────────────────────────
// Deterministic: if the existing name contains an event-themed token OR a
// 20xx year token, we substitute "<EventTitle> <Year>". Otherwise we
// preserve the name (the user has shown they care about it). Broad regex
// covers christmas/xmas/x-mas/holidays/birthday/bday/easter/halloween/
// valentine(s)/hanukkah/chanukah/diwali/kwanzaa/thanksgiving. Custom
// holiday titles add their own first-token to the matcher at runtime so
// "Mr. Mike's Diwali List" still gets renamed when Diwali approaches.
const EVENT_TOKEN_RE =
	/\b(christmas|xmas|x-?mas|holiday(?:s)?|birthday|b-?day|easter|halloween|valentine(?:'?s)?|hanukkah|chanukah|diwali|kwanzaa|thanksgiving)\b/i
const YEAR_TOKEN_RE = /\b(20\d{2})\b/

function buildRenameRegex(eventTitle: string): RegExp {
	// Take alphanumeric runs from the event title and OR them into a
	// supplemental matcher. E.g. "Mid-Autumn Festival" -> /(Mid|Autumn|Festival)/.
	const tokens = eventTitle.match(/[A-Za-z]{3,}/g) ?? []
	const escaped = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
	if (escaped.length === 0) return EVENT_TOKEN_RE
	const supplemental = new RegExp(`\\b(${escaped.join('|')})\\b`, 'i')
	return new RegExp(`${EVENT_TOKEN_RE.source}|${supplemental.source}`, 'i')
}

export function renameForConvert(currentName: string, eventTitle: string, eventYear: number): string {
	const combined = buildRenameRegex(eventTitle)
	if (combined.test(currentName) || YEAR_TOKEN_RE.test(currentName)) {
		return `${eventTitle} ${eventYear}`
	}
	return currentName
}

// Maps an event kind to the canonical list type the convert-list /
// create-list paths target. Birthday-driven conversions go to `birthday`
// (not `wishlist`) because the event-typed name is more informative —
// `wishlist` is fine for an existing list that already covers birthday,
// but when we're explicitly proposing a conversion we name it for the
// event.
function canonicalTypeForEvent(event: InWindowEvent): ListType {
	if (event.kind === 'birthday') return 'birthday'
	if (event.kind === 'christmas') return 'christmas'
	return 'holiday'
}

// Simulate the proposed list set after a hypothetical conversion. Used
// to verify the conversion doesn't kill another in-window event's coverage.
function simulateAfterConvert(
	subjectLists: ReadonlyArray<{ id: number; type: ListType; customHolidayId: string | null; isActive: boolean }>,
	targetListId: number,
	newType: ListType,
	newCustomHolidayId: string | null
): Array<{ id: number; type: ListType; customHolidayId: string | null; isActive: boolean }> {
	return subjectLists.map(l => {
		if (l.id !== targetListId) return l
		return { ...l, type: newType, customHolidayId: newCustomHolidayId }
	})
}

// Tenant-gate guard: a tenant may have turned off the canonical type for
// an event (e.g. enableBirthdayLists=false). When that happens, we can't
// suggest conversion/creation into that type. Return null = skip event.
function tenantAllowsCanonicalType(
	canonicalType: ListType,
	settings: { enableBirthdayLists: boolean; enableChristmasLists: boolean; enableGenericHolidayLists: boolean }
): boolean {
	if (canonicalType === 'birthday') return settings.enableBirthdayLists
	if (canonicalType === 'christmas') return settings.enableChristmasLists
	if (canonicalType === 'holiday') return settings.enableGenericHolidayLists
	return true
}

// ─── Analyzer ───────────────────────────────────────────────────────────────

export const listHygieneAnalyzer: Analyzer = {
	id: 'list-hygiene',
	label: 'List hygiene',
	enabledByDefault: true,
	async run(ctx): Promise<AnalyzerResult> {
		const t0 = Date.now()
		const steps: Array<AnalyzerStep> = []

		const events = await getInWindowEventsForSubject({
			userId: ctx.userId,
			dependentId: ctx.dependentId,
			settings: ctx.settings,
			now: ctx.now,
			dbx: ctx.db,
		})
		steps.push({ name: 'load-events', latencyMs: Date.now() - t0 })

		const subjectLists = await ctx.db
			.select({
				id: lists.id,
				name: lists.name,
				type: lists.type,
				isPrimary: lists.isPrimary,
				isPrivate: lists.isPrivate,
				isActive: lists.isActive,
				customHolidayId: lists.customHolidayId,
				updatedAt: lists.updatedAt,
			})
			.from(lists)
			.where(
				and(
					eq(lists.ownerId, ctx.userId),
					ctx.dependentId === null ? isNull(lists.subjectDependentId) : eq(lists.subjectDependentId, ctx.dependentId),
					eq(lists.isActive, true),
					ne(lists.type, 'giftideas'),
					ne(lists.type, 'todos')
				)
			)
			.orderBy(desc(lists.updatedAt), asc(lists.id))
		const listsStep: AnalyzerStep = { name: 'load-lists', latencyMs: Date.now() - t0 }
		steps.push(listsStep)

		// Cheap pre-bail: events empty (calendar quiet) OR no events whose
		// canonical type is even allowed by tenant settings.
		if (events.length === 0) {
			return {
				recs: [],
				steps,
				inputHash: combineHashes([sha256Hex(`list-hygiene|no-events`)]),
			}
		}

		// Stable input hash slice: events x list-shape. Don't include
		// `updatedAt` here — we don't want the analyzer to re-run cache
		// just because a list got touched. We include each list's id +
		// type + customHolidayId + isPrimary + isPrivate.
		const eventsSlice = events.map(e => `${e.kind}:${e.occurrenceISO}:${'customHolidayId' in e ? e.customHolidayId : ''}`).join(',')
		const listsSlice = subjectLists
			.map(l => `${l.id}:${l.type}:${l.customHolidayId ?? ''}:${l.isPrimary ? 1 : 0}:${l.isPrivate ? 1 : 0}`)
			.sort()
			.join(',')
		const inputHash = sha256Hex(`list-hygiene|${ctx.dependentId ?? 'user'}|events=${eventsSlice}|lists=${listsSlice}`)

		const recs: Array<AnalyzerRecOutput> = []
		const subject = subjectListRef(ctx.subject)

		for (const event of events) {
			const canonicalType = canonicalTypeForEvent(event)

			// Tenant has the canonical type disabled — analyzer has no
			// actionable recommendation it can make. Skip silently.
			if (!tenantAllowsCanonicalType(canonicalType, ctx.settings)) continue

			const matchingLists = subjectLists.filter(l => {
				if (!event.matchTypes.includes(l.type)) return false
				if (event.kind === 'custom-holiday' && l.customHolidayId !== event.customHolidayId) return false
				return true
			})
			const publicMatching = matchingLists.filter(l => !l.isPrivate)
			const privateMatching = matchingLists.filter(l => l.isPrivate)

			// Candidates for branch 1: any public list whose type/binding
			// doesn't match this event. For custom-holiday events, a
			// holiday-typed list with the WRONG customHolidayId still counts
			// (rebinding to the right holiday is the same intent).
			const publicNonMatching = subjectLists.filter(l => {
				if (l.isPrivate) return false
				if (event.matchTypes.includes(l.type)) {
					if (event.kind === 'custom-holiday' && l.customHolidayId !== event.customHolidayId) {
						return true
					}
					return false
				}
				return true
			})

			let convertRecEmitted = false

			// === Branch 1: convert a public non-matching list ===
			// "public implies intention": the user's attention-getting list
			// is the public one. If they have one that doesn't match this
			// event, reshape it. Only fires when no public matching list
			// already covers the event (otherwise we'd create two public
			// lists for the same event).
			if (publicNonMatching.length > 0 && publicMatching.length === 0) {
				for (const candidate of publicNonMatching) {
					const targetCustomHolidayId = event.kind === 'custom-holiday' ? event.customHolidayId : null
					const simulated = simulateAfterConvert(subjectLists, candidate.id, canonicalType, targetCustomHolidayId)

					// For every OTHER in-window event, ensure coverage is
					// preserved post-conversion. If conversion would break
					// another event's coverage, try the next candidate.
					const breaksOther = events.some(other => {
						if (other === event) return false
						const coveredNow = eventIsCovered(other, subjectLists)
						const coveredAfter = eventIsCovered(other, simulated)
						return coveredNow && !coveredAfter
					})
					if (breaksOther) continue

					const eventYear = event.occurrence.getUTCFullYear()
					const newName = renameForConvert(candidate.name, event.eventTitle, eventYear)

					recs.push(
						buildConvertRec({
							event,
							list: candidate,
							newType: canonicalType,
							newName,
							newCustomHolidayId: targetCustomHolidayId,
							subject,
						})
					)
					convertRecEmitted = true
					break
				}
			}

			// === Branch 2: flip a private matching list public ===
			// Only when branch 1 didn't fire AND no public matching list
			// already exists AND the user has a ready-to-promote private
			// matching list.
			if (!convertRecEmitted && publicMatching.length === 0 && privateMatching.length > 0) {
				const target = privateMatching[0]
				recs.push(buildPrivacyRec({ event, list: target, subject }))
			}

			// === Branch 3: create a new list ===
			// Fires when nothing matches the event at all. Branch 1 may
			// have yielded due to cross-event coverage protection; in that
			// case we still need to nudge the user to create a list for
			// THIS event.
			if (!convertRecEmitted && matchingLists.length === 0) {
				recs.push(buildCreateRec({ event, canonicalType, dependentId: ctx.dependentId, subject }))
			}

			// === Branch 4: rotate primary (user-subject runs only) ===
			// Skip on dependent runs because lists.isPrimary is per-owner,
			// not per-(owner, dependent). Fires when no MATCHING list is
			// already primary AND some OTHER non-matching list is primary
			// (i.e. the primary points away from the upcoming event).
			if (ctx.dependentId === null && matchingLists.length > 0) {
				const matchingPrimary = matchingLists.find(l => l.isPrimary)
				const someOtherPrimary = subjectLists.find(l => l.isPrimary && !matchingLists.includes(l))
				if (!matchingPrimary && someOtherPrimary) {
					// Prefer the canonical-typed matching list when one exists
					// (e.g. a `birthday` list over a `wishlist` for birthday).
					const canonical = matchingLists.find(l => l.type === canonicalType)
					const target = canonical ?? matchingLists[0]
					recs.push(buildSetPrimaryRec({ event, list: target, subject }))
				}
			}
		}

		return {
			recs,
			steps,
			inputHash: combineHashes([inputHash]),
		}
	},
}

// ─── Rec builders ───────────────────────────────────────────────────────────

type SubjectListSummary = ListRef['subject']

function subjectListRef(subject: { kind: 'user' | 'dependent'; name: string; image: string | null; id?: string }): SubjectListSummary {
	if (subject.kind === 'user') {
		return { kind: 'user', name: subject.name, image: subject.image }
	}
	return { kind: 'dependent', name: subject.name, image: subject.image }
}

type ListRow = {
	id: number
	name: string
	type: ListType
	isPrivate: boolean
}

function listRefFor(list: ListRow, subject: SubjectListSummary): ListRef {
	return {
		id: String(list.id),
		name: list.name,
		type: list.type,
		isPrivate: list.isPrivate,
		subject,
	}
}

function eventKey(event: InWindowEvent): string {
	if (event.kind === 'custom-holiday') return `${event.kind}:${event.customHolidayId}`
	return event.kind
}

function buildConvertRec(args: {
	event: InWindowEvent
	list: ListRow
	newType: ListType
	newName: string
	newCustomHolidayId: string | null
	subject: SubjectListSummary
}): AnalyzerRecOutput {
	const { event, list, newType, newName, newCustomHolidayId, subject } = args
	const ref = listRefFor(list, subject)
	const subjectIsYou = subject.kind === 'user'
	const owner = subjectIsYou ? 'Your' : `${subject.name}'s`
	const renameCopy = newName === list.name ? '' : ` and rename it to "${newName}"`
	const body = `${owner} ${event.eventTitle} is in ${event.daysUntil} ${event.daysUntil === 1 ? 'day' : 'days'} and the most-attention-getting list "${list.name}" isn't shaped for it. Convert it to a ${prettyListType(newType)} list${renameCopy} so gifts auto-reveal on the right day.`
	return {
		kind: 'convert-public-list',
		severity: 'important',
		title: `Reshape "${list.name}" for ${event.eventTitle}`,
		body,
		actions: [
			{
				label: `Convert to ${prettyListType(newType)}`,
				description: `Change the list's type${renameCopy ? ' and rename it' : ''}. Items and existing claims stay put.`,
				intent: 'do',
				apply: {
					kind: 'convert-list',
					listId: String(list.id),
					newType: newType,
					newName,
					newCustomHolidayId: newCustomHolidayId ?? undefined,
				},
			},
		],
		affected: {
			noun: 'list',
			count: 1,
			lines: [list.name],
			listChips: [ref],
		},
		relatedLists: [ref],
		fingerprintTargets: [eventKey(event), event.occurrenceISO, String(list.id)],
	}
}

function buildPrivacyRec(args: { event: InWindowEvent; list: ListRow; subject: SubjectListSummary }): AnalyzerRecOutput {
	const { event, list, subject } = args
	const ref = listRefFor(list, subject)
	const subjectIsYou = subject.kind === 'user'
	const owner = subjectIsYou ? 'Your' : `${subject.name}'s`
	return {
		kind: 'make-private-list-public',
		severity: 'suggest',
		title: `Make "${list.name}" public for ${event.eventTitle}`,
		body: `${owner} ${event.eventTitle} is in ${event.daysUntil} ${event.daysUntil === 1 ? 'day' : 'days'}. "${list.name}" is set up for the event but it's private — gifters can't see it. Making it public lets people shop from it.`,
		actions: [
			{
				label: 'Make public',
				description: 'Flip the list to public so gifters can find it.',
				intent: 'do',
				apply: {
					kind: 'change-list-privacy',
					listId: String(list.id),
					isPrivate: false,
				},
			},
		],
		affected: {
			noun: 'list',
			count: 1,
			lines: [list.name],
			listChips: [ref],
		},
		relatedLists: [ref],
		fingerprintTargets: [eventKey(event), event.occurrenceISO, String(list.id)],
	}
}

function buildCreateRec(args: {
	event: InWindowEvent
	canonicalType: ListType
	dependentId: string | null
	subject: SubjectListSummary
}): AnalyzerRecOutput {
	const { event, canonicalType, dependentId, subject } = args
	const subjectIsYou = subject.kind === 'user'
	const owner = subjectIsYou ? 'Your' : `${subject.name}'s`
	const eventYear = event.occurrence.getUTCFullYear()
	const name = `${event.eventTitle} ${eventYear}`
	return {
		kind: 'create-event-list',
		severity: 'suggest',
		title: `Create a ${prettyListType(canonicalType)} list for ${event.eventTitle}`,
		body: `${owner} ${event.eventTitle} is in ${event.daysUntil} ${event.daysUntil === 1 ? 'day' : 'days'}, and there's no list set up to auto-reveal gifts on that day. Want to scaffold one?`,
		actions: [
			{
				label: `Create "${name}"`,
				description: 'Creates a private list pre-named for the event. You can flip it to public once you add some items.',
				intent: 'do',
				apply: {
					kind: 'create-list',
					type: canonicalType,
					name,
					isPrivate: true,
					setAsPrimary: true,
					customHolidayId: event.kind === 'custom-holiday' ? event.customHolidayId : undefined,
					subjectDependentId: dependentId ?? undefined,
				},
			},
		],
		affected: undefined,
		fingerprintTargets: [eventKey(event), event.occurrenceISO],
	}
}

function buildSetPrimaryRec(args: { event: InWindowEvent; list: ListRow; subject: SubjectListSummary }): AnalyzerRecOutput {
	const { event, list, subject } = args
	const ref = listRefFor(list, subject)
	return {
		kind: 'wrong-primary-for-event',
		severity: 'suggest',
		title: `Set "${list.name}" as your primary for ${event.eventTitle}`,
		body: `Your ${event.eventTitle} is in ${event.daysUntil} ${event.daysUntil === 1 ? 'day' : 'days'} but "${list.name}" isn't your primary list. Making it primary means new items default into it.`,
		actions: [
			{
				label: 'Set as primary',
				description: 'Promotes this list to primary; the current primary is demoted.',
				intent: 'do',
				apply: {
					kind: 'set-primary-list',
					listId: String(list.id),
				},
			},
		],
		affected: {
			noun: 'list',
			count: 1,
			lines: [list.name],
			listChips: [ref],
		},
		relatedLists: [ref],
		fingerprintTargets: [eventKey(event), event.occurrenceISO, String(list.id)],
	}
}

function prettyListType(type: ListType): string {
	switch (type) {
		case 'wishlist':
			return 'wishlist'
		case 'christmas':
			return 'Christmas'
		case 'birthday':
			return 'birthday'
		case 'holiday':
			return 'holiday'
		case 'giftideas':
			return 'gift ideas'
		case 'todos':
			return 'todo'
		case 'test':
			return 'test'
	}
}
