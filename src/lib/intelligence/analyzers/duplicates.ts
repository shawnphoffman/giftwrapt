import { and, eq, isNull, ne } from 'drizzle-orm'

import { items, lists } from '@/db/schema'
import { visibleItemsWhere } from '@/lib/item-visibility'
import { jaccard, tokenSet } from '@/lib/text-similarity'
import { normalizeProductUrl } from '@/lib/urls'

import { composeForLog, generateObjectCached } from '../ai-call'
import type { Analyzer } from '../analyzer'
import type { AnalyzerSubject } from '../context'
import { combineHashes, sha256Hex } from '../hash'
import {
	buildDuplicatesUserPrompt,
	type DuplicateCandidate,
	DUPLICATES_MAX_PAIRS,
	DUPLICATES_SYSTEM,
	duplicatesResponseSchema,
} from '../prompts/duplicates'
import type { AnalyzerRecOutput, AnalyzerResult, AnalyzerStep, ItemRef, ListRef } from '../types'

// Two passes:
//   1. URL short-circuit: pairs that share the same normalized product
//      URL across DIFFERENT lists are the same product by definition.
//      Emit those as confident recs without ever asking the model.
//      Free precision; works even when titles diverge.
//   2. Title heuristic: token-set Jaccard above DUPLICATES_LLM_FLOOR
//      between titles across different lists. Replaces the old exact-
//      normalize key so the model sees real candidates that the strict
//      key would miss (e.g. "Lego X-Wing" vs "Lego X-Wing 75355").
//      URL-confirmed pairs are filtered out of this pass so we don't
//      double-emit. Candidates are sorted by descending Jaccard so the
//      candidateCap truncation keeps the highest-confidence pairs.
//
// Items in the same list are NOT paired in either pass (intentional
// duplicates within one list aren't actionable).

// Minimum token-set Jaccard between two titles for them to be worth
// asking the model about. Below this threshold the two items are
// essentially unrelated and the LLM round-trip would be wasted.
const DUPLICATES_LLM_FLOOR = 0.5

// Token-set Jaccard at or above this threshold is treated as a
// confident duplicate without consulting the model. 0.9 means the two
// titles share 90%+ of their tokens; pairs that score this high are
// essentially the same product with at most one disambiguator-word
// difference. Tighter than the LLM floor so we don't auto-confirm
// borderline cases.
const DUPLICATES_AUTO_CONFIRM_FLOOR = 0.9
export const duplicatesAnalyzer: Analyzer = {
	id: 'duplicates',
	label: 'Duplicates',
	enabledByDefault: true,
	async run(ctx): Promise<AnalyzerResult> {
		const t0 = Date.now()

		const rows = await ctx.db
			.select({
				itemId: items.id,
				title: items.title,
				url: items.url,
				imageUrl: items.imageUrl,
				updatedAt: items.updatedAt,
				availability: items.availability,
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
					visibleItemsWhere('visible')
				)
			)
			.limit(ctx.candidateCap * 4)

		const loadStep: AnalyzerStep = { name: 'load-items', latencyMs: Date.now() - t0 }

		type Pair = [(typeof rows)[number], (typeof rows)[number]]

		// Pass 1: URL-shared pairs across different lists. Confident, no
		// model call needed. Track the pair keys we emit here so the
		// title-heuristic pass below can skip them.
		const urlConfirmedPairs: Array<Pair> = []
		const urlConfirmedKeys = new Set<string>()
		const byUrl = new Map<string, Array<(typeof rows)[number]>>()
		for (const row of rows) {
			const key = normalizeProductUrl(row.url)
			if (!key) continue
			const arr = byUrl.get(key) ?? []
			arr.push(row)
			byUrl.set(key, arr)
		}
		for (const group of byUrl.values()) {
			if (group.length < 2) continue
			for (let i = 0; i < group.length; i++) {
				for (let j = i + 1; j < group.length; j++) {
					if (group[i].listId === group[j].listId) continue
					const ordered = group[i].itemId < group[j].itemId ? [group[i], group[j]] : [group[j], group[i]]
					urlConfirmedPairs.push([ordered[0], ordered[1]])
					urlConfirmedKeys.add(pairKey(ordered[0].itemId, ordered[1].itemId))
				}
			}
		}

		// Pass 2: token-set Jaccard above DUPLICATES_LLM_FLOOR, across
		// different lists, skipping pairs already confirmed by URL.
		// Compute token sets once per row so the O(N^2) pair loop is
		// just set intersections.
		const tokens = new Map<number, Set<string>>()
		for (const row of rows) tokens.set(row.itemId, tokenSet(row.title))

		type ScoredPair = { pair: Pair; score: number }
		const scoredPairs: Array<ScoredPair> = []
		for (let i = 0; i < rows.length; i++) {
			const a = rows[i]
			const aTokens = tokens.get(a.itemId)
			if (!aTokens || aTokens.size === 0) continue
			for (let j = i + 1; j < rows.length; j++) {
				const b = rows[j]
				if (a.listId === b.listId) continue
				const bTokens = tokens.get(b.itemId)
				if (!bTokens || bTokens.size === 0) continue
				const score = jaccard(aTokens, bTokens)
				if (score < DUPLICATES_LLM_FLOOR) continue
				const ordered: Pair = a.itemId < b.itemId ? [a, b] : [b, a]
				if (urlConfirmedKeys.has(pairKey(ordered[0].itemId, ordered[1].itemId))) continue
				scoredPairs.push({ pair: ordered, score })
			}
		}
		// Descending similarity: the closest matches go first.
		scoredPairs.sort((x, y) => y.score - x.score)

		// Auto-confirm tier: pairs at or above the high-confidence
		// threshold bypass the model entirely. Same shape as the URL
		// short-circuit but driven by title similarity instead of URL
		// identity. Track keys so the LLM candidate set below doesn't
		// re-include them.
		const autoConfirmPairs: Array<Pair> = []
		const autoConfirmKeys = new Set<string>()
		for (const { pair, score } of scoredPairs) {
			if (score < DUPLICATES_AUTO_CONFIRM_FLOOR) break
			autoConfirmPairs.push(pair)
			autoConfirmKeys.add(pairKey(pair[0].itemId, pair[1].itemId))
		}

		// LLM candidate set: everything else above the floor, minus
		// auto-confirmed pairs. Truncated to candidateCap.
		const candidatePairs: Array<Pair> = []
		for (const { pair } of scoredPairs) {
			if (autoConfirmKeys.has(pairKey(pair[0].itemId, pair[1].itemId))) continue
			candidatePairs.push(pair)
			if (candidatePairs.length >= ctx.candidateCap) break
		}

		// For the no-model fallback below, keep only the rock-solid
		// matches (identical token sets). Widening the LLM candidate
		// floor to 0.5 is fine because the LLM gates precision; without
		// a model we have no such gate, so we stay strict.
		const heuristicOnlyPairs: Array<Pair> = scoredPairs.filter(s => s.score === 1).map(s => s.pair)

		// Input hash covers every pair set so any change (URL match,
		// auto-confirm, LLM candidate) invalidates the cached run.
		const inputHash = sha256Hex(
			`dupes|url:${pairSetKey(urlConfirmedPairs)}|auto:${pairSetKey(autoConfirmPairs)}|title:${pairSetKey(candidatePairs)}`
		)

		const steps: Array<AnalyzerStep> = [loadStep]
		const recs: Array<AnalyzerRecOutput> = []

		// Emit URL-confirmed recs up front. These never need the model.
		for (const pair of urlConfirmedPairs) {
			recs.push(
				buildPairRec(
					pair,
					'suggest',
					'Same item on two lists',
					'Both items link to the same product page, so this is the same item appearing twice.',
					ctx.subject
				)
			)
		}
		if (urlConfirmedPairs.length > 0) {
			steps.push({ name: 'duplicates:url-short-circuit', latencyMs: 0 })
		}

		// Auto-confirmed recs (title Jaccard >= AUTO_CONFIRM_FLOOR).
		// Title-based, not URL-based, so the rationale differs.
		for (const pair of autoConfirmPairs) {
			recs.push(
				buildPairRec(
					pair,
					'suggest',
					'Same item on two lists',
					'These titles are nearly identical; this looks like the same product on two lists.',
					ctx.subject
				)
			)
		}
		if (autoConfirmPairs.length > 0) {
			steps.push({ name: 'duplicates:auto-confirm', latencyMs: 0 })
		}

		if (candidatePairs.length === 0) {
			return { recs, steps, inputHash: combineHashes([inputHash]) }
		}

		const promptPairs: Array<[DuplicateCandidate, DuplicateCandidate]> = candidatePairs.map(p => [
			{ itemId: String(p[0].itemId), title: p[0].title, listId: String(p[0].listId), listName: p[0].listName, listType: p[0].listType },
			{ itemId: String(p[1].itemId), title: p[1].title, listId: String(p[1].listId), listName: p[1].listName, listType: p[1].listType },
		])

		// Heuristic-only fallback: when no model, surface only the
		// rock-solid (identical token set) pairs as info-level recs.
		// The model is the precision gate; without one, we trade recall
		// for not emitting noisy "maybe-duplicate" cards.
		if (!ctx.model) {
			for (const pair of heuristicOnlyPairs) {
				recs.push(
					buildPairRec(
						pair,
						'info',
						'Possible duplicate across lists',
						'These items have very similar titles and live on different lists.',
						ctx.subject
					)
				)
			}
			return { recs, steps, inputHash: combineHashes([inputHash]) }
		}

		const userPrompt = buildDuplicatesUserPrompt({ candidatePairs: promptPairs })
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
				schema: duplicatesResponseSchema,
				system: DUPLICATES_SYSTEM,
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
			name: 'duplicates',
			prompt: composeForLog(DUPLICATES_SYSTEM, userPrompt),
			responseRaw,
			parsed,
			tokensIn,
			tokensOut,
			cachedInputTokens,
			latencyMs: Date.now() - stepStart,
			error,
		})

		if (error || !parsed) {
			return { recs, steps, inputHash: combineHashes([inputHash]) }
		}

		const aiPairs = (
			parsed as { pairs: Array<{ leftItemId: string; rightItemId: string; confident: boolean; rationale: string }> }
		).pairs.slice(0, DUPLICATES_MAX_PAIRS)
		for (const aiPair of aiPairs) {
			if (!aiPair.confident) continue
			const dbPair = candidatePairs.find(p => String(p[0].itemId) === aiPair.leftItemId && String(p[1].itemId) === aiPair.rightItemId)
			if (!dbPair) continue
			recs.push(buildPairRec(dbPair, 'suggest', `Same item on two lists`, aiPair.rationale, ctx.subject))
		}

		return { recs, steps, inputHash: combineHashes([inputHash]) }
	},
}

// Stable hash-friendly serialization of a pair set. Sorts so order
// doesn't perturb the inputHash across runs.
function pairSetKey(pairs: ReadonlyArray<readonly [{ itemId: number }, { itemId: number }]>): string {
	return pairs
		.map(p => `${p[0].itemId}-${p[1].itemId}`)
		.sort()
		.join(',')
}

// Stable key for "have we already emitted a rec for this item pair?"
// `pairKey(a, b)` and `pairKey(b, a)` collapse to the same string so the
// URL pass's dedup carries over to the title pass regardless of how the
// rows were enumerated.
function pairKey(a: number, b: number): string {
	const [lo, hi] = a < b ? [a, b] : [b, a]
	return `${lo}-${hi}`
}

type DuplicateRow = {
	itemId: number
	title: string
	url: string | null
	listId: number
	listName: string
	listType: string
	listIsPrivate: boolean
	imageUrl: string | null
	updatedAt: Date
	availability: 'available' | 'unavailable'
}

function buildPairRec(
	pair: [DuplicateRow, DuplicateRow],
	severity: 'info' | 'suggest' | 'important',
	title: string,
	rationale: string,
	subject: AnalyzerSubject
): AnalyzerRecOutput {
	const [a, b] = pair
	const listSubject: ListRef['subject'] =
		subject.kind === 'dependent'
			? { kind: 'dependent', name: subject.name, image: subject.image }
			: { kind: 'user', name: subject.name, image: subject.image }
	const listA: ListRef = {
		id: String(a.listId),
		name: a.listName,
		type: a.listType as ListRef['type'],
		isPrivate: a.listIsPrivate,
		subject: listSubject,
	}
	const listB: ListRef = {
		id: String(b.listId),
		name: b.listName,
		type: b.listType as ListRef['type'],
		isPrivate: b.listIsPrivate,
		subject: listSubject,
	}
	const itemA: ItemRef = {
		id: String(a.itemId),
		title: a.title,
		listId: String(a.listId),
		listName: a.listName,
		imageUrl: a.imageUrl,
		updatedAt: a.updatedAt,
		availability: a.availability,
	}
	const itemB: ItemRef = {
		id: String(b.itemId),
		title: b.title,
		listId: String(b.listId),
		listName: b.listName,
		imageUrl: b.imageUrl,
		updatedAt: b.updatedAt,
		availability: b.availability,
	}
	return {
		kind: 'cross-list-duplicate',
		severity,
		title,
		body: rationale,
		actions: [
			{
				label: `Open ${a.listName}`,
				description: `Jump to ${a.listName} so you can review or delete this copy.`,
				intent: 'do',
				nav: { listId: String(a.listId), itemId: String(a.itemId) },
			},
			{
				label: `Open ${b.listName}`,
				description: `Jump to ${b.listName} so you can review or delete this copy.`,
				intent: 'do',
				nav: { listId: String(b.listId), itemId: String(b.itemId) },
			},
			{ label: 'Keep both', description: "These are actually different items. We won't flag this pair again.", intent: 'noop' },
		],
		affected: {
			noun: 'items',
			count: 2,
			lines: [`${a.title} · on ${a.listName}`, `${b.title} · on ${b.listName}`],
			listChips: [listA, listB],
		},
		relatedItems: [itemA, itemB],
		relatedLists: [listA, listB],
		fingerprintTargets: [String(a.itemId), String(b.itemId)],
	}
}
