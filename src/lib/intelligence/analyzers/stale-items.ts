import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm'

import { items, lists } from '@/db/schema'
import { outputLanguageInstruction } from '@/lib/i18n/ai-language'
import type { Locale } from '@/lib/i18n/locales'
import { visibleItemsWhere } from '@/lib/item-visibility'
import { m } from '@/paraglide/messages.js'

import { composeForLog, generateObjectCached } from '../ai-call'
import type { Analyzer } from '../analyzer'
import type { AnalyzerSubject } from '../context'
import { combineHashes, sha256Hex } from '../hash'
import {
	buildStaleItemsUserPrompt,
	STALE_ITEMS_MAX_LISTS,
	STALE_ITEMS_MAX_RECS_PER_LIST,
	STALE_ITEMS_SYSTEM,
	type StaleItemsCandidate,
	staleItemsResponseSchema,
} from '../prompts/stale-items'
import type { AnalyzerRecOutput, AnalyzerResult, AnalyzerStep, ItemRef, ListRef, RecommendationAction } from '../types'
import { pickGroupPriority } from './grouping'

const STALE_DAYS_THRESHOLD = 180 // 6 months

// Pre-filter to "items > 6 months old on the user's active, non-giftideas
// lists". The AI then ranks/annotates a small slate. The model never sees
// claim data.
export const staleItemsAnalyzer: Analyzer = {
	id: 'stale-items',
	label: 'Stale Items',
	enabledByDefault: true,
	async run(ctx): Promise<AnalyzerResult> {
		const t0 = Date.now()
		const cutoff = new Date(ctx.now.getTime() - STALE_DAYS_THRESHOLD * 86400000)

		const candidates = await ctx.db
			.select({
				itemId: items.id,
				title: items.title,
				priority: items.priority,
				updatedAt: items.updatedAt,
				availability: items.availability,
				imageUrl: items.imageUrl,
				listId: lists.id,
				listName: lists.name,
				listType: lists.type,
				listIsPrivate: lists.isPrivate,
			})
			.from(items)
			.innerJoin(lists, eq(items.listId, lists.id))
			.where(
				and(
					eq(lists.ownerId, ctx.userId),
					ctx.dependentId === null ? isNull(lists.subjectDependentId) : eq(lists.subjectDependentId, ctx.dependentId),
					eq(lists.isActive, true),
					ne(lists.type, 'giftideas'),
					ne(lists.type, 'todos'),
					visibleItemsWhere('visible'),
					sql`${items.updatedAt} < ${cutoff.toISOString()}`
				)
			)
			.orderBy(asc(items.updatedAt), desc(items.id))
			.limit(ctx.candidateCap)

		const loadStep: AnalyzerStep = { name: 'load-candidates', latencyMs: Date.now() - t0 }
		const finalInputHash = combineHashes([
			sha256Hex(
				`stale|${candidates
					.map(c => `${c.itemId}:${c.updatedAt.toISOString()}`)
					.sort()
					.join(',')}`
			),
		])

		// Skip-before-call: an identical candidate slice means the model
		// would see the exact same prompt as last run. Bail before any
		// model work; the runner keeps this scope's existing recs.
		if (!ctx.dryRun && ctx.priorInputHash != null && ctx.priorInputHash === finalInputHash) {
			return { recs: [], steps: [loadStep], inputHash: finalInputHash, unchanged: true }
		}

		if (candidates.length === 0) {
			return { recs: [], steps: [loadStep], inputHash: finalInputHash }
		}

		// Group candidates by list. The AI sees a single batched prompt
		// covering ALL lists; per-list grouping just shapes the prompt and
		// makes the response easy to map back. One model call per round
		// instead of one per list = lower latency and fewer per-call
		// overheads. Tradeoff: one parse/network failure kills the whole
		// stale-items batch instead of just one list.
		const byList = new Map<number, Array<(typeof candidates)[number]>>()
		for (const c of candidates) {
			const arr = byList.get(c.listId) ?? []
			arr.push(c)
			byList.set(c.listId, arr)
		}

		const steps: Array<AnalyzerStep> = [loadStep]
		const recs: Array<AnalyzerRecOutput> = []

		// Heuristic-only fallback when no model is configured: surface a
		// single muted rec per list when the count is meaningful.
		if (!ctx.model) {
			for (const [listId, group] of byList.entries()) {
				if (group.length < 2) continue
				const listRef = listRefFor(listId, group, ctx.subject)
				const itemRefs = itemRefsFor(group)
				recs.push(buildHeuristicRec({ list: listRef, items: itemRefs, locale: ctx.locale }))
			}
			return { recs, steps, inputHash: finalInputHash }
		}

		const promptCandidates: Array<StaleItemsCandidate> = candidates.map(c => ({
			itemId: String(c.itemId),
			title: c.title,
			listId: String(c.listId),
			listName: c.listName,
			listType: c.listType,
			updatedAt: c.updatedAt,
			availability: c.availability,
		}))

		const userPrompt = buildStaleItemsUserPrompt({ candidates: promptCandidates, now: ctx.now }) + outputLanguageInstruction(ctx.locale)
		const stepStart = Date.now()
		let parsed: unknown = null
		let responseRaw: string | null = null
		let error: string | null = null
		let tokensIn = 0
		let tokensOut = 0
		let cachedInputTokens = 0
		try {
			const result = await generateObjectCached({
				model: ctx.model,
				userId: ctx.userId,
				db: ctx.db,
				source: ctx.source,
				schema: staleItemsResponseSchema,
				system: STALE_ITEMS_SYSTEM,
				prompt: userPrompt,
			})
			parsed = result.object
			responseRaw = JSON.stringify(result.object)
			tokensIn = result.usage.inputTokens
			tokensOut = result.usage.outputTokens
			cachedInputTokens = result.usage.cachedInputTokens
		} catch (err) {
			error = err instanceof Error ? err.message : String(err)
		}
		steps.push({
			name: 'stale:batched',
			prompt: composeForLog(STALE_ITEMS_SYSTEM, userPrompt),
			responseRaw,
			parsed,
			tokensIn,
			tokensOut,
			cachedInputTokens,
			latencyMs: Date.now() - stepStart,
			error,
		})

		if (error || !parsed) {
			return { recs, steps, inputHash: finalInputHash }
		}

		const aiLists = (
			parsed as {
				lists: Array<{
					listId: string
					recs: Array<{
						include: boolean
						severity: 'info' | 'suggest' | 'important'
						headline: string
						rationale: string
						itemIds: Array<string>
						intent: 'pick-one' | 'cleanup'
					}>
				}>
			}
		).lists.slice(0, STALE_ITEMS_MAX_LISTS)

		for (const aiList of aiLists) {
			const flagged = aiList.recs.slice(0, STALE_ITEMS_MAX_RECS_PER_LIST).filter(r => r.include)
			if (flagged.length === 0) continue
			// Resolve the model's listId back to the DB rows. Skip lists the
			// model invented or that aren't in our candidate set.
			const numericListId = Number(aiList.listId)
			if (!Number.isFinite(numericListId)) continue
			const group = byList.get(numericListId)
			if (!group) continue

			// Build a one-time map of itemId -> row so each rec can pluck
			// only the items it flagged, not the entire candidate group.
			const candidatesById = new Map(group.map(c => [String(c.itemId), c]))
			const listRef = listRefFor(numericListId, group, ctx.subject)

			for (const ai of flagged) {
				const flaggedRows = ai.itemIds.map(id => candidatesById.get(id)).filter((r): r is (typeof group)[number] => r !== undefined)
				if (flaggedRows.length === 0) continue
				const itemRefs = itemRefsFor(flaggedRows)
				// 'pick-one' is only meaningful for 2+ items; clamp to
				// 'cleanup' when the model returned pick-one with a single
				// item (schema can't express "at least two" without
				// blowing up structured-output compatibility).
				const intent: 'pick-one' | 'cleanup' = ai.intent === 'pick-one' && itemRefs.length >= 2 ? 'pick-one' : 'cleanup'
				const groupPriority = pickGroupPriority(flaggedRows.map(r => r.priority))
				recs.push(
					intent === 'pick-one'
						? buildPickOneRec({
								itemRefs,
								listRef,
								headline: ai.headline,
								rationale: ai.rationale,
								severity: ai.severity,
								groupPriority,
								locale: ctx.locale,
							})
						: buildCleanupRec({
								itemRefs,
								listRef,
								headline: ai.headline,
								rationale: ai.rationale,
								severity: ai.severity,
								now: ctx.now,
								locale: ctx.locale,
							})
				)
			}
		}

		return { recs, steps, inputHash: finalInputHash }
	},
}

type CandidateRow = {
	itemId: number
	title: string
	priority: 'very-high' | 'high' | 'normal' | 'low'
	updatedAt: Date
	availability: 'available' | 'unavailable'
	imageUrl: string | null
	listId: number
	listName: string
	listType: string
	listIsPrivate: boolean
}

function listRefFor(listId: number, group: ReadonlyArray<CandidateRow>, subject: AnalyzerSubject): ListRef {
	return {
		id: String(listId),
		name: group[0].listName,
		type: group[0].listType as ListRef['type'],
		isPrivate: group[0].listIsPrivate,
		subject: subjectToListSubject(subject),
	}
}

function subjectToListSubject(subject: AnalyzerSubject): ListRef['subject'] {
	if (subject.kind === 'dependent') {
		return { kind: 'dependent', name: subject.name, image: subject.image }
	}
	return { kind: 'user', name: subject.name, image: subject.image }
}

function itemRefsFor(rows: ReadonlyArray<CandidateRow>): Array<ItemRef> {
	return rows.map(g => ({
		id: String(g.itemId),
		title: g.title,
		listId: String(g.listId),
		listName: g.listName,
		imageUrl: g.imageUrl,
		updatedAt: g.updatedAt,
		availability: g.availability,
	}))
}

function daysSince(date: Date, now: Date): number {
	return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86400000))
}

// Cleanup intent: items are individually stale. The model can co-flag
// 2+ items but treats them as independently disposable - we emit one
// delete row per item so the user can pick which copies go without
// committing to a bulk delete. The 'pick-one' intent (alternative
// versions of the same thing) takes the buildPickOneRec path instead.
function buildCleanupRec({
	itemRefs,
	listRef,
	headline,
	rationale,
	severity,
	now,
	locale,
}: {
	itemRefs: Array<ItemRef>
	listRef: ListRef
	headline: string
	rationale: string
	severity: 'info' | 'suggest' | 'important'
	now: Date
	locale: Locale
}): AnalyzerRecOutput {
	const o = { locale }
	return {
		kind: itemRefs.length === 1 ? 'old-item' : 'old-items',
		severity,
		title: headline,
		body: rationale,
		actions: buildCleanupActions(itemRefs, listRef, locale),
		dismissDescription: m.intel_stale_items_dismiss({}, o),
		affected: {
			noun: itemRefs.length === 1 ? m.intel_common_noun_item({}, o) : m.intel_common_noun_items({}, o),
			count: itemRefs.length,
			lines: itemRefs.map(it => m.intel_stale_items_line_last_edited({ title: it.title, days: daysSince(it.updatedAt, now) }, o)),
			listChips: [listRef],
		},
		relatedItems: itemRefs,
		relatedLists: [listRef],
		fingerprintTargets: itemRefs.map(it => it.id),
	}
}

function buildCleanupActions(itemRefs: Array<ItemRef>, listRef: ListRef, locale: Locale): Array<RecommendationAction> {
	const o = { locale }
	const openList: RecommendationAction = {
		label: m.intel_common_action_open_list_label({}, o),
		description: m.intel_stale_items_action_open_list_description({ listName: listRef.name }, o),
		intent: 'do',
		// Land on the first flagged item rather than the top of the list so
		// the user doesn't have to hunt for it (single-item recs land on the
		// item itself).
		nav: { listId: listRef.id, itemId: itemRefs[0].id },
	}

	if (itemRefs.length === 1) {
		const it = itemRefs[0]
		return [
			openList,
			{
				label: m.intel_stale_items_action_edit_label({}, o),
				description: m.intel_stale_items_action_edit_description({}, o),
				intent: 'do',
				editItem: { listId: listRef.id, itemId: it.id },
			},
			{
				label: m.intel_stale_items_action_delete_item_label({}, o),
				description: m.intel_stale_items_action_delete_item_description({}, o),
				intent: 'destructive',
				confirmCopy: m.intel_stale_items_action_delete_confirm({ title: it.title, listName: listRef.name }, o),
				apply: { kind: 'delete-items', listId: listRef.id, itemIds: [it.id] },
			},
		]
	}

	return [
		openList,
		...itemRefs.map(
			(it): RecommendationAction => ({
				label: m.intel_stale_items_action_delete_label({}, o),
				description: m.intel_stale_items_action_delete_description({ title: it.title }, o),
				intent: 'destructive',
				confirmCopy: m.intel_stale_items_action_delete_confirm({ title: it.title, listName: listRef.name }, o),
				apply: { kind: 'delete-items', listId: listRef.id, itemIds: [it.id] },
			})
		),
	]
}

// Pick-one intent: the AI judged 2+ items to be alternatives the
// recipient would only want ONE of (different versions / brands / sizes
// of the same kind of thing). Emit the rec using the same shape as the
// grouping analyzer (kind: 'group-suggestion', create-group 'or' apply
// payload) so the rec card renders the same affordance and the category
// router files it under "Organize" instead of "Cleanup". Per-item
// deletes are dropped - if the user disagrees with the grouping
// premise, "Keep separate" dismisses without further prompts; if they
// want to delete one of the items they can still open the list.
function buildPickOneRec({
	itemRefs,
	listRef,
	headline,
	rationale,
	severity,
	groupPriority,
	locale,
}: {
	itemRefs: Array<ItemRef>
	listRef: ListRef
	headline: string
	rationale: string
	severity: 'info' | 'suggest' | 'important'
	groupPriority: 'very-high' | 'high' | 'normal' | 'low'
	locale: Locale
}): AnalyzerRecOutput {
	const o = { locale }
	const itemIds = itemRefs.map(it => it.id)
	return {
		kind: 'group-suggestion',
		severity,
		title: headline,
		body: rationale,
		actions: [
			{
				label: m.intel_common_action_group_pick_one_label({}, o),
				description: m.intel_common_action_group_pick_one_description({}, o),
				intent: 'do',
				apply: { kind: 'create-group', listId: listRef.id, groupType: 'or', itemIds, priority: groupPriority },
			},
			{
				label: m.intel_common_action_open_list_label({}, o),
				description: m.intel_stale_items_pick_one_open_list_description({ listName: listRef.name }, o),
				intent: 'do',
				nav: { listId: listRef.id, itemId: itemRefs[0].id },
			},
			{
				label: m.intel_common_action_keep_separate_label({}, o),
				description: m.intel_stale_items_pick_one_keep_separate_description({}, o),
				intent: 'noop',
			},
		],
		dismissDescription: m.intel_stale_items_dismiss({}, o),
		affected: {
			noun: m.intel_common_noun_items({}, o),
			count: itemRefs.length,
			lines: itemRefs.map(it => m.intel_common_line_item_on_list({ title: it.title, listName: it.listName }, o)),
			listChips: [listRef],
		},
		relatedItems: itemRefs,
		relatedLists: [listRef],
		fingerprintTargets: itemIds,
	}
}

function buildHeuristicRec({ list, items: itemRefs, locale }: { list: ListRef; items: Array<ItemRef>; locale: Locale }): AnalyzerRecOutput {
	const o = { locale }
	// No model available: we can't tell pick-one from cleanup, so default
	// to cleanup (the safer framing - "old items, take a look").
	return {
		kind: 'old-items',
		severity: 'info',
		title: m.intel_stale_items_heuristic_title({ listName: list.name }, o),
		body: m.intel_stale_items_heuristic_body({ count: itemRefs.length }, o),
		actions: [
			{
				label: m.intel_common_action_open_list_label({}, o),
				description: m.intel_stale_items_heuristic_open_list_description({ listName: list.name }, o),
				intent: 'do',
				nav: { listId: list.id, itemId: itemRefs[0].id },
			},
		],
		affected: {
			noun: m.intel_common_noun_items({}, o),
			count: itemRefs.length,
			lines: itemRefs.map(it => it.title),
			listChips: [list],
		},
		relatedItems: itemRefs,
		relatedLists: [list],
		fingerprintTargets: itemRefs.map(it => it.id),
	}
}
