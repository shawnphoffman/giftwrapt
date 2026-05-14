import { and, eq, isNull, ne, sql } from 'drizzle-orm'

import { items, itemScrapes, lists } from '@/db/schema'

import type { Analyzer } from '../analyzer'
import type { AnalyzerSubject } from '../context'
import { combineHashes, sha256Hex } from '../hash'
import type { AnalyzerRecOutput, AnalyzerResult, AnalyzerStep, ListRef, RecSubItem } from '../types'

// Items where the user added a URL, the scraper found candidate images,
// but the item itself still has no `imageUrl` selected. Almost always
// means the user skipped picking from the image chooser at scrape time.
// Bundled per list (see missing-price.ts header for the bundling model).
export const missingImageAnalyzer: Analyzer = {
	id: 'missing-image',
	label: 'Unselected images',
	enabledByDefault: true,
	async run(ctx): Promise<AnalyzerResult> {
		const t0 = Date.now()

		const candidateImages = sql<Array<string> | null>`(
			SELECT ${itemScrapes.imageUrls}
			FROM ${itemScrapes}
			WHERE ${itemScrapes.itemId} = ${items.id}
				AND ${itemScrapes.ok} = true
				AND ${itemScrapes.imageUrls} IS NOT NULL
				AND array_length(${itemScrapes.imageUrls}, 1) > 0
			ORDER BY ${itemScrapes.createdAt} DESC
			LIMIT 1
		)`

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
				candidateImages: candidateImages.as('candidate_images'),
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
					isNull(items.pendingDeletionAt),
					isNull(items.imageUrl),
					sql`${candidateImages} IS NOT NULL`
				)
			)
			.limit(ctx.candidateCap)

		const loadStep: AnalyzerStep = { name: 'load-candidates', latencyMs: Date.now() - t0 }
		const inputHash = sha256Hex(
			`missing-image|${candidates
				.map(c => `${c.itemId}:${c.candidateImages?.length ?? 0}`)
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
	candidateImages: Array<string> | null
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
		const subItems: Array<RecSubItem> = listRows.map(c => {
			const n = c.candidateImages?.length ?? 0
			return {
				id: String(c.itemId),
				title: c.title,
				detail: `${n} candidate image${n === 1 ? '' : 's'} available`,
				thumbnailUrl: c.imageUrl,
				nav: { listId: String(c.listId), itemId: String(c.itemId), openEdit: true },
			}
		})
		const count = subItems.length
		recs.push({
			kind: 'missing-image-selection',
			severity: 'info',
			title: count === 1 ? `Pick an image for an item on ${first.listName}` : `Pick images for items on ${first.listName}`,
			body:
				count === 1
					? 'We pulled candidate images from the linked page but none are set on this item yet.'
					: 'These items have candidate images we scraped from their linked pages, but none of those have been picked yet. Open the list to choose images for several at once, or use Edit / Skip on each item below.',
			actions: [],
			dismissDescription: "Hide this suggestion for this list. We won't surface it again unless something changes about these items.",
			affected: {
				noun: count === 1 ? 'item' : 'items',
				count,
				lines: [`${first.listName} · ${count} item${count === 1 ? '' : 's'} with unselected images`],
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
