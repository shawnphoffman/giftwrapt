import { and, eq, isNull, ne, sql } from 'drizzle-orm'

import { items, itemScrapes, lists } from '@/db/schema'

import type { Analyzer } from '../analyzer'
import type { AnalyzerSubject } from '../context'
import { combineHashes, sha256Hex } from '../hash'
import type { AnalyzerRecOutput, AnalyzerResult, AnalyzerStep, ItemRef, ListRef } from '../types'

// Items where the user added a URL, the scraper found candidate images,
// but the item itself still has no `imageUrl` selected. Almost always
// means the user skipped picking from the image chooser at scrape time.
// One short hop into the edit dialog lets them pick.
export const missingImageAnalyzer: Analyzer = {
	id: 'missing-image',
	label: 'Unselected images',
	enabledByDefault: true,
	async run(ctx): Promise<AnalyzerResult> {
		const t0 = Date.now()

		// Pull the latest successful scrape per item that has a non-empty
		// imageUrls array. Items without a URL or with an imageUrl already
		// set are filtered out; the inner subquery returns the most recent
		// scrape with candidate images.
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
					eq(items.isArchived, false),
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

		const recs: Array<AnalyzerRecOutput> = candidates.map(c => buildRec(c, ctx.subject))
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

function buildRec(row: CandidateRow, subject: AnalyzerSubject): AnalyzerRecOutput {
	const listSubject: ListRef['subject'] =
		subject.kind === 'dependent'
			? { kind: 'dependent', name: subject.name, image: subject.image }
			: { kind: 'user', name: subject.name, image: subject.image }
	const listRef: ListRef = {
		id: String(row.listId),
		name: row.listName,
		type: row.listType as ListRef['type'],
		isPrivate: row.listIsPrivate,
		subject: listSubject,
	}
	const itemRef: ItemRef = {
		id: String(row.itemId),
		title: row.title,
		listId: String(row.listId),
		listName: row.listName,
		imageUrl: row.imageUrl,
		updatedAt: row.updatedAt,
		availability: row.availability,
	}
	const candidateCount = row.candidateImages?.length ?? 0
	return {
		kind: 'missing-image-selection',
		severity: 'info',
		title: `Pick an image for ${row.title}`,
		body: `We pulled ${candidateCount} candidate image${candidateCount === 1 ? '' : 's'} from the linked page but none are set on this item yet.`,
		actions: [
			{
				label: 'Choose image',
				description: 'Open the edit dialog for this item so you can pick one of the scraped candidate images.',
				intent: 'do',
				nav: { listId: String(row.listId), itemId: String(row.itemId), openEdit: true },
			},
		],
		dismissDescription: "Hide this suggestion. We won't surface it again unless this item changes.",
		affected: {
			noun: 'item',
			count: 1,
			lines: [`${row.title} · on ${row.listName}`, `${candidateCount} candidate image${candidateCount === 1 ? '' : 's'} available`],
			listChips: [listRef],
		},
		relatedItems: [itemRef],
		relatedLists: [listRef],
		fingerprintTargets: [String(row.itemId)],
	}
}
