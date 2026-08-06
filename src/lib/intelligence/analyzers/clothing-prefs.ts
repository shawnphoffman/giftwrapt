import { and, eq, isNull, ne } from 'drizzle-orm'

import { itemAiAnalysis, items, lists } from '@/db/schema'
import { visibleItemsWhere } from '@/lib/item-visibility'

import type { Analyzer } from '../analyzer'
import type { AnalyzerSubject } from '../context'
import { combineHashes, sha256Hex } from '../hash'
import type { AnalyzerRecOutput, AnalyzerResult, AnalyzerStep, ListRef, RecSubItem } from '../types'

// Facet-driven: reads the per-item clothing facets that the enrichment
// pre-step persisted into `item_ai_analysis` (is it clothing? does the
// title/notes already pin down size/color?) and bundles the gaps per
// list. No model call happens here — the classification was paid for
// once, when the item was created or last edited, instead of on every
// intelligence run. Items that haven't been enriched yet (brand-new, or
// beyond the enrichment sweep's per-run cap) simply don't surface until
// a later run.
export const clothingPrefsAnalyzer: Analyzer = {
	id: 'clothing-prefs',
	label: 'Clothing size & color',
	enabledByDefault: true,
	async run(ctx): Promise<AnalyzerResult> {
		const t0 = Date.now()

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
				analysisHash: itemAiAnalysis.contentHash,
				isClothing: itemAiAnalysis.isClothing,
				hasSize: itemAiAnalysis.hasSize,
				hasColor: itemAiAnalysis.hasColor,
				sizingRationale: itemAiAnalysis.sizingRationale,
			})
			.from(items)
			.innerJoin(lists, eq(items.listId, lists.id))
			.leftJoin(itemAiAnalysis, eq(itemAiAnalysis.itemId, items.id))
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
			.limit(ctx.candidateCap)

		const loadStep: AnalyzerStep = { name: 'load-candidates', latencyMs: Date.now() - t0 }
		// Hash the facet state, not just item identity: re-enrichment after
		// a content edit (new analysisHash) or a facet flip must invalidate
		// the carried recs even though the item id set didn't change.
		const finalInputHash = combineHashes([
			sha256Hex(
				`clothing-prefs|${candidates
					.map(
						c =>
							`${c.itemId}:${c.analysisHash ?? 'none'}:${c.isClothing ? 1 : 0}${c.hasSize ? 1 : 0}${c.hasColor ? 1 : 0}:${c.sizingRationale ?? ''}`
					)
					.sort()
					.join(',')}`
			),
		])

		// Skip-before-call kept for symmetry with the AI analyzers: when
		// nothing changed, the runner keeps this scope's existing rows and
		// even the (cheap) bundle rebuild is skipped.
		if (!ctx.dryRun && ctx.priorInputHash != null && ctx.priorInputHash === finalInputHash) {
			return { recs: [], steps: [loadStep], inputHash: finalInputHash, unchanged: true }
		}

		const flagged = candidates.filter(c => c.isClothing === true && !(c.hasSize === true && c.hasColor === true))
		const recs = buildBundles(flagged, ctx.subject)
		return { recs, steps: [loadStep], inputHash: finalInputHash }
	},
}

type CandidateRow = {
	itemId: number
	title: string
	updatedAt: Date
	availability: 'available' | 'unavailable'
	imageUrl: string | null
	listId: number
	listName: string
	listType: string
	listIsPrivate: boolean
	sizingRationale: string | null
}

function buildBundles(rows: ReadonlyArray<CandidateRow>, subject: AnalyzerSubject): Array<AnalyzerRecOutput> {
	const byList = new Map<number, Array<CandidateRow>>()
	for (const row of rows) {
		const arr = byList.get(row.listId) ?? []
		arr.push(row)
		byList.set(row.listId, arr)
	}
	const recs: Array<AnalyzerRecOutput> = []
	for (const [, listEntries] of byList) {
		listEntries.sort((a, b) => a.title.localeCompare(b.title))
		const first = listEntries[0]
		const listRef = makeListRef(first, subject)
		const subItems: Array<RecSubItem> = listEntries.map(row => ({
			id: String(row.itemId),
			title: row.title,
			detail: row.sizingRationale ?? 'No size or color recorded yet.',
			thumbnailUrl: row.imageUrl,
			nav: { listId: String(row.listId), itemId: String(row.itemId), openEdit: true },
		}))
		const count = subItems.length
		recs.push({
			kind: 'clothing-missing-prefs',
			severity: 'suggest',
			title: count === 1 ? `Pin down sizing on an item on ${first.listName}` : `Pin down sizing on items on ${first.listName}`,
			body:
				count === 1
					? "This clothing item doesn't have a size or color pinned down. Gifters can guess wrong without one."
					: "These clothing items don't have a size or color pinned down. Gifters can guess wrong without one - the model's per-item notes are below.",
			actions: [],
			dismissDescription: "Hide this suggestion for this list. We won't surface it again unless something changes about these items.",
			affected: {
				noun: count === 1 ? 'item' : 'items',
				count,
				lines: [`${first.listName} · ${count} clothing item${count === 1 ? '' : 's'} missing sizing or color`],
				listChips: [listRef],
			},
			relatedLists: [listRef],
			fingerprintTargets: [`list:${first.listId}`],
			subItems,
			bundleNav: { listId: String(first.listId) },
		})
	}
	return recs
}

function makeListRef(row: CandidateRow, subject: AnalyzerSubject): ListRef {
	const listSubject: ListRef['subject'] =
		subject.kind === 'dependent'
			? { kind: 'dependent', name: subject.name, image: subject.image }
			: { kind: 'user', name: subject.name, image: subject.image }
	return {
		id: String(row.listId),
		name: row.listName,
		type: row.listType as ListRef['type'],
		isPrivate: row.listIsPrivate,
		subject: listSubject,
	}
}
