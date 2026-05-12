import { and, eq, isNotNull, isNull, ne } from 'drizzle-orm'

import { items, lists } from '@/db/schema'

import type { Analyzer } from '../analyzer'
import type { AnalyzerSubject } from '../context'
import { combineHashes, sha256Hex } from '../hash'
import type { AnalyzerRecOutput, AnalyzerResult, AnalyzerStep, ListRef, RecSubItem } from '../types'

// Heuristic-only: surfaces items the user added a URL to but never filled in
// a price for. Bundled per list: one rec per (list, this analyzer kind),
// with each item rendered as a sub-row in the rec card. Skipping a sub-row
// hides just that item; dismissing the bundle hides the whole list's
// recommendation. See ../coerce-legacy-action.ts for the legacy per-item
// rec shape that this replaces - old rows cycle out at the next regen.
export const missingPriceAnalyzer: Analyzer = {
	id: 'missing-price',
	label: 'Missing prices',
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
				url: items.url,
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
					isNotNull(items.url),
					isNull(items.price)
				)
			)
			.limit(ctx.candidateCap)

		const loadStep: AnalyzerStep = { name: 'load-candidates', latencyMs: Date.now() - t0 }
		const inputHash = sha256Hex(
			`missing-price|${candidates
				.map(c => String(c.itemId))
				.sort()
				.join(',')}`
		)

		if (candidates.length === 0) {
			return { recs: [], steps: [loadStep], inputHash: combineHashes([inputHash]) }
		}

		const recs = buildBundles(candidates, ctx.subject)
		return { recs, steps: [loadStep], inputHash: combineHashes([inputHash]) }
	},
}

type CandidateRow = {
	itemId: number
	title: string
	updatedAt: Date
	availability: 'available' | 'unavailable'
	imageUrl: string | null
	url: string | null
	listId: number
	listName: string
	listType: string
	listIsPrivate: boolean
}

function buildBundles(rows: ReadonlyArray<CandidateRow>, subject: AnalyzerSubject): Array<AnalyzerRecOutput> {
	const byList = new Map<number, Array<CandidateRow>>()
	for (const row of rows) {
		const arr = byList.get(row.listId) ?? []
		arr.push(row)
		byList.set(row.listId, arr)
	}
	const recs: Array<AnalyzerRecOutput> = []
	for (const [, listRows] of byList) {
		listRows.sort((a, b) => a.title.localeCompare(b.title))
		const first = listRows[0]
		const listRef = makeListRef(first, subject)
		const subItems: Array<RecSubItem> = listRows.map(c => ({
			id: String(c.itemId),
			title: c.title,
			thumbnailUrl: c.imageUrl,
			nav: { listId: String(c.listId), itemId: String(c.itemId), openEdit: true },
		}))
		const count = subItems.length
		recs.push({
			kind: 'missing-price',
			severity: 'info',
			title: count === 1 ? `Add a price to an item on ${first.listName}` : `Add prices to items on ${first.listName}`,
			body:
				count === 1
					? 'This item has a link but no price. Filling one in helps gifters budget and surfaces it on price-filtered views.'
					: 'These items have links but no price set. Filling them in helps gifters budget and surfaces them on price-filtered views. Open the list to fix several at once, or use Edit / Skip on each item below.',
			actions: [],
			dismissDescription: "Hide this suggestion for this list. We won't surface it again unless something changes about these items.",
			affected: {
				noun: count === 1 ? 'item' : 'items',
				count,
				lines: [`${first.listName} · ${count} item${count === 1 ? '' : 's'} missing a price`],
				listChips: [listRef],
			},
			relatedLists: [listRef],
			// listRef is intentionally in fingerprintTargets so the
			// fingerprint is (analyzerId, kind, listId): adding/removing
			// items from the bundle does NOT churn the fingerprint, so
			// sub-item dismissals stay sticky across regenerations.
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
