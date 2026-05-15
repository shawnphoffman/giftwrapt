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

import { generateObject } from 'ai'
import { and, asc, count, desc, eq, inArray, isNull, max, ne } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { customHolidays, items, lists, users } from '@/db/schema'
import { birthMonthEnumValues, type ListType } from '@/db/schema/enums'
import { customHolidayLastOccurrence } from '@/lib/custom-holidays'
import { SPOILER_PROTECTED_TYPES } from '@/lib/list-type-moves'
import type { AppSettings } from '@/lib/settings'

import type { Analyzer } from '../analyzer'
import type { AnalyzerContext } from '../context'
import { combineHashes, sha256Hex } from '../hash'
import {
	buildListHygieneRenamePrompt,
	LIST_HYGIENE_RENAME_AI_CAP,
	listHygieneRenameResponseSchema,
	validateRenameResponse,
} from '../prompts/list-hygiene-rename'
import type { AnalyzerRecOutput, AnalyzerResult, AnalyzerStep, ListRef } from '../types'
import { eventIsCovered, getInWindowEventsForSubject, type InWindowEvent, lastAnnualDate } from '../upcoming-events'

// Threshold the older list in a candidate duplicate pair must clear: if
// its `updatedAt` is within this window, the list is considered "still
// in active use" and the pair is not surfaced as a duplicate. 365 days
// is a hardcoded constant so we don't surface noisy near-duplicates the
// owner is actively managing; promote to a setting if operators ask.
const DUPLICATE_FORGOTTEN_AGE_MS = 365 * 24 * 60 * 60 * 1000

// Types eligible for `merge-lists` apply. Mirrors
// `SPOILER_PROTECTED_TYPES` plus `holiday` (holiday-to-holiday merges
// are safe iff `customHolidayId` matches on both sides). The
// `isCrossTypeMoveDestructive` assertion in the apply branch ensures
// claims survive every merge this analyzer proposes.
const MERGE_ELIGIBLE_TYPES: ReadonlySet<ListType> = new Set([...SPOILER_PROTECTED_TYPES, 'holiday'])

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
				createdAt: lists.createdAt,
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

		// Per-list non-archived, non-pending-deletion item count + the most
		// recent `items.updatedAt` across that bucket. The count is used by
		// the duplicates pass (clusters require both lists to have at least
		// one "real" item) and the stale-list pass (empty-list short-cut).
		// The MAX is used by the stale-list pass to compute owner-inactivity
		// for non-event-bound types. `items.isArchived` is recipient-
		// controlled and therefore safe to read; we never read `giftedItems`.
		const itemCountRows =
			subjectLists.length > 0
				? await ctx.db
						.select({ listId: items.listId, n: count(items.id), maxUpdatedAt: max(items.updatedAt) })
						.from(items)
						.where(
							and(
								inArray(
									items.listId,
									subjectLists.map(l => l.id)
								),
								eq(items.isArchived, false),
								isNull(items.pendingDeletionAt)
							)
						)
						.groupBy(items.listId)
				: []
		const itemCountByList = new Map<number, number>(itemCountRows.map(r => [r.listId, Number(r.n)]))
		const maxItemUpdatedAtByList = new Map<number, Date | null>(
			itemCountRows.map(r => [r.listId, r.maxUpdatedAt ? new Date(r.maxUpdatedAt) : null])
		)
		steps.push({ name: 'load-item-counts', latencyMs: Date.now() - t0 })

		// Stable input hash slice: events x list-shape + duplicate-cluster
		// shape. Don't include `updatedAt` directly — we don't want the
		// analyzer to re-run cache just because a list got touched — but
		// we DO bucket `createdAt` to the day so a freshly-created list
		// joining a cluster invalidates the hash.
		const eventsSlice = events.map(e => `${e.kind}:${e.occurrenceISO}:${'customHolidayId' in e ? e.customHolidayId : ''}`).join(',')
		const listsSlice = subjectLists
			.map(l => {
				const createdDay = Math.floor(l.createdAt.getTime() / 86_400_000)
				const hasItems = (itemCountByList.get(l.id) ?? 0) > 0 ? 1 : 0
				return `${l.id}:${l.type}:${l.customHolidayId ?? ''}:${l.isPrimary ? 1 : 0}:${l.isPrivate ? 1 : 0}:${createdDay}:${hasItems}`
			})
			.sort()
			.join(',')
		const inputHash = sha256Hex(`list-hygiene|${ctx.dependentId ?? 'user'}|events=${eventsSlice}|lists=${listsSlice}`)

		const recs: Array<AnalyzerRecOutput> = []
		const subject = subjectListRef(ctx.subject)

		// Per-run state for the opt-in AI rename path on branch 1. The
		// cap defends against pathological seed states (one user with
		// many public non-matching lists) by bounding total AI calls
		// inside a single analyzer pass.
		const renameState: RenameState = { aiCallsUsed: 0 }

		// Calendar-quiet case: the per-event branches have nothing to do
		// but the duplicates pass and the stale-public-list pass can
		// still fire on their own.
		if (events.length === 0) {
			const clusters = findDuplicateClusters({ subjectLists, itemCountByList, now: ctx.now })
			for (const cluster of clusters) recs.push(buildMergeRec({ cluster, subject }))
			if (ctx.dependentId === null) {
				const stale = await findStalePublicLists({
					subjectLists,
					itemCountByList,
					maxItemUpdatedAtByList,
					now: ctx.now,
					settings: ctx.settings,
					userId: ctx.userId,
					dbx: ctx.db,
				})
				for (const candidate of stale) recs.push(buildStaleListRec({ candidate, subject }))
			}
			return { recs, steps, inputHash: combineHashes([inputHash]) }
		}

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
					const newName = await chooseConvertName({
						ctx,
						steps,
						state: renameState,
						currentName: candidate.name,
						newType: canonicalType,
						eventTitle: event.eventTitle,
						eventYear,
					})

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

		// === Duplicates pass (independent of the per-event loop) ===
		// Surfaces clusters of same-type (and matching-customHolidayId for
		// holiday) lists where the older list looks forgotten relative to
		// the newer one. Restricted to types whose claims can survive a
		// merge — see MERGE_ELIGIBLE_TYPES.
		const clusters = findDuplicateClusters({ subjectLists, itemCountByList, now: ctx.now })
		for (const cluster of clusters) recs.push(buildMergeRec({ cluster, subject }))

		// === Stale-public-list pass (user-subject runs only) ===
		// Time-delay only by construction: NEVER reads `giftedItems` or
		// `items.isArchived` to decide who to flag. Spoiler safety is
		// preserved at the candidate-query level — we rely on enough wall-
		// clock time having passed that holding-back is unlikely.
		if (ctx.dependentId === null) {
			const stale = await findStalePublicLists({
				subjectLists,
				itemCountByList,
				maxItemUpdatedAtByList,
				now: ctx.now,
				settings: ctx.settings,
				userId: ctx.userId,
				dbx: ctx.db,
			})
			for (const candidate of stale) recs.push(buildStaleListRec({ candidate, subject }))
		}

		return {
			recs,
			steps,
			inputHash: combineHashes([inputHash]),
		}
	},
}

// ─── AI rename chooser ──────────────────────────────────────────────────────

// Mutable state threaded through every branch-1 candidate in a single
// analyzer pass. The cap counter survives across events because the
// cap is a per-run total, not per-event.
type RenameState = { aiCallsUsed: number }

type ChooseConvertNameArgs = {
	ctx: AnalyzerContext
	steps: Array<AnalyzerStep>
	state: RenameState
	currentName: string
	newType: ListType
	eventTitle: string
	eventYear: number
}

// Returns the proposed `newName` for a `convert-public-list` rec
// candidate. When the AI toggle is off, returns the regex name from
// `renameForConvert`. When the toggle is on, attempts a single AI call
// (with per-run cap), validates the response, and falls back to the
// regex name on any failure. The decision is recorded as a run-step so
// admins can audit `rename-fallback-*` paths.
export async function chooseConvertName(args: ChooseConvertNameArgs): Promise<string> {
	const { ctx, steps, state, currentName, newType, eventTitle, eventYear } = args
	const regexName = renameForConvert(currentName, eventTitle, eventYear)

	if (!ctx.settings.intelligenceListHygieneRenameWithAi) return regexName

	// Provider not configured (or otherwise unavailable): silently fall
	// back to the regex path for this run. Telemetry records the reason
	// so it's debuggable from the admin runs surface.
	if (!ctx.model) {
		steps.push({ name: 'rename-fallback-no-provider', latencyMs: 0 })
		return regexName
	}

	if (state.aiCallsUsed >= LIST_HYGIENE_RENAME_AI_CAP) {
		steps.push({ name: 'rename-fallback-cap', latencyMs: 0 })
		return regexName
	}

	state.aiCallsUsed += 1
	const prompt = buildListHygieneRenamePrompt({
		currentName,
		newType: prettyListType(newType),
		eventTitle,
		eventYear,
	})
	const stepStart = Date.now()
	let parsed: unknown = null
	let responseRaw: string | null = null
	let error: string | null = null
	let tokensIn = 0
	let tokensOut = 0
	try {
		const result = await generateObject({
			model: ctx.model,
			schema: listHygieneRenameResponseSchema,
			prompt,
		})
		parsed = result.object
		responseRaw = JSON.stringify(result.object)
		tokensIn = result.usage.inputTokens ?? 0
		tokensOut = result.usage.outputTokens ?? 0
	} catch (err) {
		error = err instanceof Error ? err.message : String(err)
	}
	steps.push({
		name: 'list-hygiene-rename',
		prompt,
		responseRaw,
		parsed,
		tokensIn,
		tokensOut,
		latencyMs: Date.now() - stepStart,
		error,
	})

	if (error || !parsed) {
		steps.push({ name: 'rename-fallback-error', latencyMs: 0 })
		return regexName
	}

	const validated = validateRenameResponse(parsed, { eventTitle, eventYear })
	if (validated === null) {
		steps.push({ name: 'rename-fallback-validation', latencyMs: 0 })
		return regexName
	}
	return validated
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

// ─── Duplicate clustering ───────────────────────────────────────────────────

export type DuplicateListRow = {
	id: number
	name: string
	type: ListType
	isPrimary: boolean
	isPrivate: boolean
	customHolidayId: string | null
	createdAt: Date
	updatedAt: Date
}

export type DuplicateCluster = {
	type: ListType
	customHolidayId: string | null
	survivor: DuplicateListRow
	sources: ReadonlyArray<DuplicateListRow>
}

// Pure helper, exported for unit tests. Groups subjectLists into clusters
// where:
//   - All members share the same `type` (and same `customHolidayId` when
//     `type='holiday'`).
//   - Members' type is in `MERGE_ELIGIBLE_TYPES` (claim-preserving).
//   - Every member has at least one non-archived, non-pending-deletion
//     item (per the `itemCountByList` map).
//   - The OLDEST member (by `createdAt`) has `updatedAt` more than
//     `DUPLICATE_FORGOTTEN_AGE_MS` ago, so the cluster looks forgotten
//     rather than actively co-managed.
// Survivor selection within a cluster:
//   1. newest `createdAt`
//   2. tie -> `isPrimary=true` wins
//   3. tie -> highest `updatedAt` wins
//   4. tie -> lowest `id` wins (stable for tests).
export function findDuplicateClusters(args: {
	subjectLists: ReadonlyArray<DuplicateListRow>
	itemCountByList: ReadonlyMap<number, number>
	now: Date
}): Array<DuplicateCluster> {
	const { subjectLists, itemCountByList, now } = args
	const forgottenCutoff = now.getTime() - DUPLICATE_FORGOTTEN_AGE_MS

	// Bucket by (type, customHolidayId-or-null). Only merge-eligible
	// types reach the bucketing step. Lists with zero non-archived,
	// non-pending-deletion items are excluded (empty lists are out).
	const buckets = new Map<string, Array<DuplicateListRow>>()
	for (const list of subjectLists) {
		if (!MERGE_ELIGIBLE_TYPES.has(list.type)) continue
		if ((itemCountByList.get(list.id) ?? 0) === 0) continue
		// Holiday clusters require a non-null customHolidayId on both sides
		// so the apply branch's matching check never has to handle null.
		if (list.type === 'holiday' && list.customHolidayId === null) continue
		const key = `${list.type}|${list.customHolidayId ?? ''}`
		const arr = buckets.get(key) ?? []
		arr.push(list)
		buckets.set(key, arr)
	}

	const clusters: Array<DuplicateCluster> = []
	for (const [, bucket] of buckets) {
		if (bucket.length < 2) continue
		// Oldest by createdAt; ties broken by lowest id for stability.
		const oldest = bucket.reduce((acc, l) => {
			if (l.createdAt.getTime() < acc.createdAt.getTime()) return l
			if (l.createdAt.getTime() === acc.createdAt.getTime() && l.id < acc.id) return l
			return acc
		})
		if (oldest.updatedAt.getTime() > forgottenCutoff) continue
		const sorted = [...bucket].sort((a, b) => {
			// Newest createdAt first.
			if (a.createdAt.getTime() !== b.createdAt.getTime()) {
				return b.createdAt.getTime() - a.createdAt.getTime()
			}
			// isPrimary wins.
			if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
			// Highest updatedAt.
			if (a.updatedAt.getTime() !== b.updatedAt.getTime()) {
				return b.updatedAt.getTime() - a.updatedAt.getTime()
			}
			// Lowest id (stable test order).
			return a.id - b.id
		})
		const survivor = sorted[0]
		const sources = sorted.slice(1)
		clusters.push({ type: survivor.type, customHolidayId: survivor.customHolidayId, survivor, sources })
	}

	// Stable cluster order for deterministic rec output.
	clusters.sort((a, b) => {
		if (a.type !== b.type) return a.type.localeCompare(b.type)
		const aKey = a.customHolidayId ?? ''
		const bKey = b.customHolidayId ?? ''
		if (aKey !== bKey) return aKey.localeCompare(bKey)
		return a.survivor.id - b.survivor.id
	})
	return clusters
}

function buildMergeRec(args: { cluster: DuplicateCluster; subject: SubjectListSummary }): AnalyzerRecOutput {
	const { cluster, subject } = args
	const { survivor, sources, type, customHolidayId } = cluster
	const all = [survivor, ...sources]
	const survivorRef = listRefFor(survivor, subject)
	const listChips = all.map(l => listRefFor(l, subject))
	const sourceCountWord = sources.length === 1 ? '1 older list' : `${sources.length} older lists`
	const olderText = sources.length === 1 ? "the older one hasn't" : "the older ones haven't"
	const title = `Merge ${sourceCountWord} into "${survivor.name}"`
	const body = `You have ${all.length} active ${prettyListType(type)} lists. "${survivor.name}" was created most recently; ${olderText} been touched in over a year. Merging moves items into the newer list and archives the older one${sources.length === 1 ? '' : 's'}.`
	return {
		kind: 'duplicate-event-lists',
		severity: 'suggest',
		title,
		body,
		actions: [
			{
				label: 'Merge into newest',
				description:
					'Moves items, item groups, and list addons onto the newer list. Older lists are archived (reversible), not deleted; existing claims follow the items.',
				intent: 'do',
				apply: {
					kind: 'merge-lists',
					survivorListId: String(survivor.id),
					sourceListIds: sources.map(s => String(s.id)),
				},
			},
		],
		affected: {
			noun: 'list',
			count: all.length,
			lines: all.map(l => l.name),
			listChips,
		},
		relatedLists: [survivorRef],
		fingerprintTargets: ['duplicate-event-lists', type, customHolidayId ?? '', ...all.map(l => String(l.id)).sort()],
	}
}

// ─── Stale-public-list pass ─────────────────────────────────────────────────

// Reverse of the convert-list rename rule: strip event tokens AND year
// tokens, collapse whitespace, fall back to "Wishlist" when nothing
// meaningful remains. Used by the stale-public-list rec's "Convert to
// wishlist" action so the proposed `newName` doesn't carry stale
// event-themed copy (e.g. "Christmas 2023") into the converted list.
// Exported for unit tests.
export function reverseRenameToWishlist(currentName: string): string {
	// Use a global-flag clone so every match is stripped, not just the
	// first one. The shared constants at the top of this file are not
	// global because the convert-rename path only needs `.test`.
	const eventGlobal = new RegExp(EVENT_TOKEN_RE.source, 'gi')
	const yearGlobal = new RegExp(YEAR_TOKEN_RE.source, 'g')
	const stripped = currentName.replace(eventGlobal, '').replace(yearGlobal, '').replace(/\s+/g, ' ').trim()
	if (stripped.length >= 3) return stripped
	return 'Wishlist'
}

// Listed types whose `lists.type` corresponds to a calendar event. The
// stale-list "event-passed" predicate fires only for these types; the
// wishlist case never satisfies branch 1 of `evaluateStaleListPredicate`.
const EVENT_BOUND_TYPES: ReadonlySet<ListType> = new Set(['birthday', 'christmas', 'holiday'])

// Types eligible for the stale-list rec at all. Mirrors the merge-
// eligible set: anything outside `SPOILER_PROTECTED_TYPES` + `holiday`
// either has no calendar binding worth flagging or is already filtered
// upstream (giftideas / todos).
const STALE_ELIGIBLE_TYPES: ReadonlySet<ListType> = new Set([...SPOILER_PROTECTED_TYPES, 'holiday'])

export type StaleListPredicateInput = {
	list: { type: ListType; updatedAt: Date }
	// Most recent `items.updatedAt` for non-archived, non-pending-deletion
	// items on this list. Null when the list is empty (treated as
	// satisfying the items half of the inactive predicate — there's
	// nothing to invalidate the silence).
	maxItemUpdatedAt: Date | null
	// Most recent past occurrence of the relevant calendar event for
	// the list's type. Null for `wishlist` (not event-bound) and for
	// holiday-typed lists with a customHolidayId that no longer
	// resolves to a past occurrence (catalog entry missing, etc.).
	lastEventDate: Date | null
	now: Date
	pastEventDays: number
	inactiveMonths: number
}

export type StaleListReason = 'event-passed' | 'inactive' | 'both'

// Pure predicate. Exported for unit tests. Returns `null` when the
// list is NOT stale by either branch.
export function evaluateStaleListPredicate(input: StaleListPredicateInput): StaleListReason | null {
	const { list, maxItemUpdatedAt, lastEventDate, now, pastEventDays, inactiveMonths } = input

	// Branch 1: event-passed. Only applies to event-bound types AND
	// only when we successfully resolved a past occurrence.
	let eventPassed = false
	if (EVENT_BOUND_TYPES.has(list.type) && lastEventDate) {
		const daysSinceEvent = Math.floor((now.getTime() - lastEventDate.getTime()) / 86_400_000)
		if (daysSinceEvent >= pastEventDays) eventPassed = true
	}

	// Branch 2: owner-inactive. Both `lists.updatedAt` AND
	// MAX(items.updatedAt) must be older than the threshold. An empty
	// list (maxItemUpdatedAt === null) satisfies the items half because
	// there's nothing to invalidate the silence.
	const inactiveCutoff = new Date(now.getTime() - inactiveMonths * 30 * 86_400_000)
	const listInactive = list.updatedAt.getTime() < inactiveCutoff.getTime()
	const itemsInactive = maxItemUpdatedAt === null || maxItemUpdatedAt.getTime() < inactiveCutoff.getTime()
	const ownerInactive = listInactive && itemsInactive

	if (eventPassed && ownerInactive) return 'both'
	if (eventPassed) return 'event-passed'
	if (ownerInactive) return 'inactive'
	return null
}

export type StaleListCandidate = {
	list: {
		id: number
		name: string
		type: ListType
		isPrivate: boolean
		customHolidayId: string | null
		updatedAt: Date
	}
	reason: StaleListReason
	// The most recent past occurrence the predicate keyed off, when the
	// reason includes event-passed. Used in the rec body copy to render
	// "Last <EventTitle> was <N> days ago." Null when the reason is
	// `inactive`.
	lastEventDate: Date | null
	// The pretty event title for body copy. Same null rule as
	// `lastEventDate`.
	eventTitle: string | null
}

// Orchestrator. Resolves "last event date" per list (birthday from
// users.birthMonth/Day, Christmas from Dec 25, holiday from
// customHolidays via `customHolidayLastOccurrence`) and runs the
// predicate. Restricted to public lists owned by the subject user with
// no `subjectDependentId` (user-subject runs only). The candidate set
// SQL-level filter never reads `giftedItems` or `items.isArchived` to
// decide who to flag — spoiler safety by construction.
export async function findStalePublicLists(args: {
	subjectLists: ReadonlyArray<{
		id: number
		name: string
		type: ListType
		isPrimary: boolean
		isPrivate: boolean
		isActive: boolean
		customHolidayId: string | null
		updatedAt: Date
		createdAt: Date
	}>
	itemCountByList: ReadonlyMap<number, number>
	maxItemUpdatedAtByList: ReadonlyMap<number, Date | null>
	now: Date
	settings: AppSettings
	userId: string
	dbx: SchemaDatabase
}): Promise<Array<StaleListCandidate>> {
	const { subjectLists, maxItemUpdatedAtByList, now, settings, userId, dbx } = args

	// Filter to candidates eligible for the stale-list rec.
	const candidates = subjectLists.filter(l => {
		if (l.isPrivate) return false
		if (!l.isActive) return false
		if (!STALE_ELIGIBLE_TYPES.has(l.type)) return false
		return true
	})
	if (candidates.length === 0) return []

	// Resolve user's birthday once (only when at least one candidate
	// could use it). Birthday list type uses it; wishlist also uses it
	// when interpreted as a birthday surface, but the stale-list pass
	// keys off `list.type` so a wishlist never hits the event-passed
	// branch — no need to load the user's birth month for that case.
	let lastBirthdayDate: Date | null = null
	const hasBirthdayCandidate = candidates.some(l => l.type === 'birthday')
	if (hasBirthdayCandidate) {
		const me = await dbx.query.users.findFirst({
			where: eq(users.id, userId),
			columns: { birthMonth: true, birthDay: true },
		})
		const bMonth = me?.birthMonth ? birthMonthEnumValues.indexOf(me.birthMonth) + 1 : null
		const bDay = me?.birthDay ?? null
		if (bMonth && bDay) {
			lastBirthdayDate = lastAnnualDate(bMonth, bDay, now)
		}
	}

	// Christmas: Dec 25 of either this year (if today is past it) or
	// last year. No tenant gate here — even when Christmas lists are
	// disabled, an existing christmas-typed list that's gone stale is
	// still a useful nudge to clean up.
	const lastChristmasDate = lastAnnualDate(12, 25, now)

	// Resolve per-customHolidayId last occurrences for any holiday-typed
	// candidates. One query per unique id; small N (lists per user).
	const holidayIds = Array.from(
		new Set(
			candidates
				.filter(l => l.type === 'holiday')
				.map(l => l.customHolidayId)
				.filter((id): id is string => id !== null)
		)
	)
	const lastHolidayByCustomId = new Map<string, { date: Date | null; title: string }>()
	if (holidayIds.length > 0) {
		const rows = await dbx.query.customHolidays.findMany({
			where: inArray(customHolidays.id, holidayIds),
		})
		for (const row of rows) {
			const last = await customHolidayLastOccurrence(row, now, dbx)
			lastHolidayByCustomId.set(row.id, { date: last, title: row.title })
		}
	}

	const out: Array<StaleListCandidate> = []
	for (const list of candidates) {
		const maxItemUpdatedAt = maxItemUpdatedAtByList.get(list.id) ?? null
		const itemCount = args.itemCountByList.get(list.id) ?? 0
		// Empty AND active for less than the inactive threshold? Defer
		// to deletion instead — but the empty-list-and-old case still
		// fires via the inactive branch below.
		let lastEventDate: Date | null = null
		let eventTitle: string | null = null
		if (list.type === 'birthday') {
			lastEventDate = lastBirthdayDate
			eventTitle = 'Birthday'
		} else if (list.type === 'christmas') {
			lastEventDate = lastChristmasDate
			eventTitle = 'Christmas'
		} else if (list.type === 'holiday' && list.customHolidayId) {
			const entry = lastHolidayByCustomId.get(list.customHolidayId)
			lastEventDate = entry?.date ?? null
			eventTitle = entry?.title ?? null
		}

		const reason = evaluateStaleListPredicate({
			list: { type: list.type, updatedAt: list.updatedAt },
			maxItemUpdatedAt,
			lastEventDate,
			now,
			pastEventDays: settings.intelligenceStaleListPastEventDays,
			inactiveMonths: settings.intelligenceStaleListInactiveMonths,
		})
		if (!reason) continue

		// Defensive: when the reason is `event-passed` but we couldn't
		// resolve the event title (rare, e.g. holiday row gone), drop
		// the candidate. Surfacing a rec with placeholder copy would be
		// worse than silence.
		if ((reason === 'event-passed' || reason === 'both') && eventTitle === null) continue

		void itemCount // referenced for symmetry with duplicates pass; predicate doesn't gate on it
		out.push({
			list: {
				id: list.id,
				name: list.name,
				type: list.type,
				isPrivate: list.isPrivate,
				customHolidayId: list.customHolidayId,
				updatedAt: list.updatedAt,
			},
			reason,
			lastEventDate: reason === 'inactive' ? null : lastEventDate,
			eventTitle: reason === 'inactive' ? null : eventTitle,
		})
	}

	// Stable order: oldest list `updatedAt` first so the most-stale
	// candidate renders at the top.
	out.sort((a, b) => a.list.updatedAt.getTime() - b.list.updatedAt.getTime() || a.list.id - b.list.id)
	return out
}

function buildStaleListRec(args: { candidate: StaleListCandidate; subject: SubjectListSummary }): AnalyzerRecOutput {
	const { candidate, subject } = args
	const { list, reason, lastEventDate, eventTitle } = candidate
	const ref = listRefFor(list, subject)
	const daysSince = lastEventDate ? Math.floor((Date.now() - lastEventDate.getTime()) / 86_400_000) : 0

	let body: string
	if (reason === 'inactive') {
		body = `"${list.name}" hasn't been touched in over a year. Archive it if you're done, or convert it to a plain wishlist if it's still useful.`
	} else {
		const inactiveTail = reason === 'both' ? " It also hasn't been touched in over a year." : ''
		body = `Last ${eventTitle} was ${daysSince} ${daysSince === 1 ? 'day' : 'days'} ago and "${list.name}" is still active. Archive it if you're done, or convert it to a plain wishlist if it's still useful.${inactiveTail}`
	}

	return {
		kind: 'stale-public-list',
		severity: 'suggest',
		title: `"${list.name}" looks stale`,
		body,
		actions: [
			{
				label: 'Archive list',
				description: 'Flip the list to inactive. Items and any past gifts stay queryable; you can un-archive later.',
				intent: 'do',
				apply: { kind: 'archive-list', listId: String(list.id) },
			},
			{
				label: 'Convert to wishlist',
				description: 'Strip the event binding and rename to a plain wishlist. Useful if the list is still relevant year-round.',
				intent: 'do',
				apply: {
					kind: 'convert-list',
					listId: String(list.id),
					newType: 'wishlist',
					newName: reverseRenameToWishlist(list.name),
					newCustomHolidayId: null,
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
		fingerprintTargets: ['stale-public-list', String(list.id), reason],
	}
}
