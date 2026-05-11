import { generateObject } from 'ai'
import { and, eq, isNull, ne } from 'drizzle-orm'

import { items, lists } from '@/db/schema'

import type { Analyzer } from '../analyzer'
import type { AnalyzerSubject } from '../context'
import { combineHashes, sha256Hex } from '../hash'
import { buildDuplicatesPrompt, type DuplicateCandidate, DUPLICATES_MAX_PAIRS, duplicatesResponseSchema } from '../prompts/duplicates'
import type { AnalyzerRecOutput, AnalyzerResult, AnalyzerStep, ItemRef, ListRef } from '../types'

// Heuristic pre-filter: normalize titles and surface pairs across the
// user's active, non-giftideas lists where the normalized form matches.
// AI confirms semantic duplicates. Items in the same list are NOT paired
// (intentional duplicates within one list aren't actionable).
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
					eq(items.isArchived, false)
				)
			)
			.limit(ctx.candidateCap * 4)

		const loadStep: AnalyzerStep = { name: 'load-items', latencyMs: Date.now() - t0 }

		// Group by normalized title; emit pairs across DIFFERENT lists.
		const byNorm = new Map<string, Array<(typeof rows)[number]>>()
		for (const row of rows) {
			const key = normalize(row.title)
			if (!key) continue
			const arr = byNorm.get(key) ?? []
			arr.push(row)
			byNorm.set(key, arr)
		}

		type Pair = [(typeof rows)[number], (typeof rows)[number]]
		const candidatePairs: Array<Pair> = []
		for (const group of byNorm.values()) {
			if (group.length < 2) continue
			for (let i = 0; i < group.length; i++) {
				for (let j = i + 1; j < group.length; j++) {
					if (group[i].listId === group[j].listId) continue
					candidatePairs.push([group[i], group[j]])
					if (candidatePairs.length >= ctx.candidateCap) break
				}
				if (candidatePairs.length >= ctx.candidateCap) break
			}
			if (candidatePairs.length >= ctx.candidateCap) break
		}

		const inputHash = sha256Hex(
			`dupes|${candidatePairs
				.map(p => `${p[0].itemId}-${p[1].itemId}`)
				.sort()
				.join(',')}`
		)

		if (candidatePairs.length === 0) {
			return { recs: [], steps: [loadStep], inputHash: combineHashes([inputHash]) }
		}

		const steps: Array<AnalyzerStep> = [loadStep]
		const recs: Array<AnalyzerRecOutput> = []

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

		const prompt = buildDuplicatesPrompt({ candidatePairs: promptPairs })
		const stepStart = Date.now()
		let parsed: unknown = null
		let responseRaw: string | null = null
		let error: string | null = null
		let tokensIn = 0
		let tokensOut = 0
		try {
			const result = await generateObject({
				model: ctx.model,
				schema: duplicatesResponseSchema,
				prompt,
			})
			parsed = result.object
			responseRaw = JSON.stringify(result.object)
			tokensIn = result.usage.inputTokens ?? 0
			tokensOut = result.usage.outputTokens ?? 0
		} catch (err) {
			error = err instanceof Error ? err.message : String(err)
		}
		steps.push({ name: 'duplicates', prompt, responseRaw, parsed, tokensIn, tokensOut, latencyMs: Date.now() - stepStart, error })

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

function buildPairRec(
	pair: [
		{
			itemId: number
			title: string
			listId: number
			listName: string
			listType: string
			listIsPrivate: boolean
			imageUrl: string | null
			updatedAt: Date
			availability: 'available' | 'unavailable'
		},
		{
			itemId: number
			title: string
			listId: number
			listName: string
			listType: string
			listIsPrivate: boolean
			imageUrl: string | null
			updatedAt: Date
			availability: 'available' | 'unavailable'
		},
	],
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
