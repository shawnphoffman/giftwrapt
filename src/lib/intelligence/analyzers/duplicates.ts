import { and, eq, isNull, ne } from 'drizzle-orm'

import { items, lists } from '@/db/schema'
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
//   2. Title heuristic: normalize titles and pair across lists. Model
//      confirms semantic duplicates. URL-confirmed pairs are filtered
//      out of this pass so we don't double-emit.
//
// Items in the same list are NOT paired in either pass (intentional
// duplicates within one list aren't actionable).
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
					eq(items.isArchived, false),
					isNull(items.pendingDeletionAt)
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

		// Pass 2: title-normalize, but skip pairs already confirmed by URL.
		const byNorm = new Map<string, Array<(typeof rows)[number]>>()
		for (const row of rows) {
			const key = normalize(row.title)
			if (!key) continue
			const arr = byNorm.get(key) ?? []
			arr.push(row)
			byNorm.set(key, arr)
		}

		const candidatePairs: Array<Pair> = []
		for (const group of byNorm.values()) {
			if (group.length < 2) continue
			for (let i = 0; i < group.length; i++) {
				for (let j = i + 1; j < group.length; j++) {
					if (group[i].listId === group[j].listId) continue
					const ordered = group[i].itemId < group[j].itemId ? [group[i], group[j]] : [group[j], group[i]]
					if (urlConfirmedKeys.has(pairKey(ordered[0].itemId, ordered[1].itemId))) continue
					candidatePairs.push([ordered[0], ordered[1]])
					if (candidatePairs.length >= ctx.candidateCap) break
				}
				if (candidatePairs.length >= ctx.candidateCap) break
			}
			if (candidatePairs.length >= ctx.candidateCap) break
		}

		// Input hash covers BOTH passes' pair sets so a change in
		// URL-confirmed pairs invalidates the cached run just like a
		// title-pair change does.
		const inputHash = sha256Hex(
			`dupes|url:${urlConfirmedPairs
				.map(p => `${p[0].itemId}-${p[1].itemId}`)
				.sort()
				.join(',')}|title:${candidatePairs
				.map(p => `${p[0].itemId}-${p[1].itemId}`)
				.sort()
				.join(',')}`
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

		if (candidatePairs.length === 0) {
			return { recs, steps, inputHash: combineHashes([inputHash]) }
		}

		const promptPairs: Array<[DuplicateCandidate, DuplicateCandidate]> = candidatePairs.map(p => [
			{ itemId: String(p[0].itemId), title: p[0].title, listId: String(p[0].listId), listName: p[0].listName, listType: p[0].listType },
			{ itemId: String(p[1].itemId), title: p[1].title, listId: String(p[1].listId), listName: p[1].listName, listType: p[1].listType },
		])

		// Heuristic-only fallback: when no model, surface high-confidence
		// (exact normalized match) pairs as info-level recs.
		if (!ctx.model) {
			for (const pair of candidatePairs) {
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

function normalize(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9 ]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
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
