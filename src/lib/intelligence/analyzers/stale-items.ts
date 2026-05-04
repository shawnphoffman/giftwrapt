import { generateObject } from 'ai'
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm'

import { items, lists } from '@/db/schema'

import type { Analyzer } from '../analyzer'
import { combineHashes, sha256Hex } from '../hash'
import { buildStaleItemsPrompt, type StaleItemsCandidate, staleItemsResponseSchema } from '../prompts/stale-items'
import type { AnalyzerRecOutput, AnalyzerResult, AnalyzerStep, ItemRef, ListRef } from '../types'

const STALE_DAYS_THRESHOLD = 180 // 6 months

// Pre-filter to "items > 6 months old on the user's active, non-giftideas
// lists". The AI then ranks/annotates a small slate. The model never sees
// claim data.
export const staleItemsAnalyzer: Analyzer = {
	id: 'stale-items',
	label: 'Stale items',
	enabledByDefault: true,
	async run(ctx): Promise<AnalyzerResult> {
		const t0 = Date.now()
		const cutoff = new Date(ctx.now.getTime() - STALE_DAYS_THRESHOLD * 86400000)

		const candidates = await ctx.db
			.select({
				itemId: items.id,
				title: items.title,
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
					eq(lists.isActive, true),
					ne(lists.type, 'giftideas'),
					eq(items.isArchived, false),
					sql`${items.updatedAt} < ${cutoff.toISOString()}`
				)
			)
			.orderBy(asc(items.updatedAt), desc(items.id))
			.limit(ctx.candidateCap)

		const loadStep: AnalyzerStep = { name: 'load-candidates', latencyMs: Date.now() - t0 }
		const inputHash = sha256Hex(
			`stale|${candidates
				.map(c => `${c.itemId}:${c.updatedAt.toISOString()}`)
				.sort()
				.join(',')}`
		)

		if (candidates.length === 0) {
			return { recs: [], steps: [loadStep], inputHash: combineHashes([inputHash]) }
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
				const { listRef, itemRefs } = refsForGroup(listId, group)
				recs.push(buildHeuristicRec({ list: listRef, items: itemRefs }))
			}
			return { recs, steps, inputHash: combineHashes([inputHash]) }
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

		const prompt = buildStaleItemsPrompt({ candidates: promptCandidates, now: ctx.now })
		const stepStart = Date.now()
		let parsed: unknown = null
		let responseRaw: string | null = null
		let error: string | null = null
		let tokensIn = 0
		let tokensOut = 0
		try {
			const result = await generateObject({
				model: ctx.model,
				schema: staleItemsResponseSchema,
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
			name: 'stale:batched',
			prompt,
			responseRaw,
			parsed,
			tokensIn,
			tokensOut,
			latencyMs: Date.now() - stepStart,
			error,
		})

		if (error || !parsed) {
			return { recs, steps, inputHash: combineHashes([inputHash]) }
		}

		const aiLists = (
			parsed as {
				lists: Array<{
					listId: string
					recs: Array<{ include: boolean; severity: 'info' | 'suggest' | 'important'; headline: string; rationale: string }>
				}>
			}
		).lists

		for (const aiList of aiLists) {
			const flagged = aiList.recs.filter(r => r.include)
			if (flagged.length === 0) continue
			// Resolve the model's listId back to the DB rows. Skip lists the
			// model invented or that aren't in our candidate set.
			const numericListId = Number(aiList.listId)
			if (!Number.isFinite(numericListId)) continue
			const group = byList.get(numericListId)
			if (!group) continue

			const { listRef, itemRefs } = refsForGroup(numericListId, group)
			const severity = pickSeverity(flagged.map(r => r.severity))
			recs.push({
				kind: itemRefs.length === 1 ? 'old-item' : 'old-items',
				severity,
				title: flagged[0].headline,
				body: flagged[0].rationale,
				actions: [
					{
						label: 'Open list',
						description: `Jump to ${listRef.name} so you can edit or remove these items one at a time.`,
						intent: 'do',
					},
					{
						label: itemRefs.length === 1 ? 'Delete item' : `Delete ${itemRefs.length} items`,
						description:
							itemRefs.length === 1
								? 'Permanently delete this item. It has no claims, so no gifters are affected.'
								: `Permanently delete all ${itemRefs.length} items.`,
						intent: 'destructive',
					},
				],
				dismissDescription: "Hide this recommendation. We won't suggest it again unless these items change.",
				affected: {
					noun: itemRefs.length === 1 ? 'item' : 'items',
					count: itemRefs.length,
					lines: itemRefs.map(it => `${it.title} · last edited ${daysSince(it.updatedAt, ctx.now)} days ago`),
					listChips: [listRef],
				},
				relatedItems: itemRefs,
				relatedLists: [listRef],
				fingerprintTargets: itemRefs.map(it => it.id),
			})
		}

		return { recs, steps, inputHash: combineHashes([inputHash]) }
	},
}

function refsForGroup(
	listId: number,
	group: Array<{
		itemId: number
		title: string
		updatedAt: Date
		availability: 'available' | 'unavailable'
		imageUrl: string | null
		listName: string
		listType: string
		listIsPrivate: boolean
	}>
): { listRef: ListRef; itemRefs: Array<ItemRef> } {
	const listRef: ListRef = {
		id: String(listId),
		name: group[0].listName,
		type: group[0].listType as ListRef['type'],
		isPrivate: group[0].listIsPrivate,
		subject: { kind: 'user', name: 'You', image: null },
	}
	const itemRefs: Array<ItemRef> = group.map(g => ({
		id: String(g.itemId),
		title: g.title,
		listId: String(listId),
		listName: g.listName,
		imageUrl: g.imageUrl,
		updatedAt: g.updatedAt,
		availability: g.availability,
	}))
	return { listRef, itemRefs }
}

function pickSeverity(severities: Array<'info' | 'suggest' | 'important'>): 'info' | 'suggest' | 'important' {
	if (severities.includes('important')) return 'important'
	if (severities.includes('suggest')) return 'suggest'
	return 'info'
}

function daysSince(date: Date, now: Date): number {
	return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86400000))
}

function buildHeuristicRec({ list, items: itemRefs }: { list: ListRef; items: Array<ItemRef> }): AnalyzerRecOutput {
	return {
		kind: 'old-items',
		severity: 'info',
		title: `Old items on ${list.name}`,
		body: `${itemRefs.length} items here haven't been edited in over six months. Worth a glance.`,
		actions: [
			{
				label: 'Open list',
				description: `Jump to ${list.name} to review.`,
				intent: 'do',
			},
		],
		affected: {
			noun: 'items',
			count: itemRefs.length,
			lines: itemRefs.map(it => it.title),
			listChips: [list],
		},
		relatedItems: itemRefs,
		relatedLists: [list],
		fingerprintTargets: itemRefs.map(it => it.id),
	}
}
