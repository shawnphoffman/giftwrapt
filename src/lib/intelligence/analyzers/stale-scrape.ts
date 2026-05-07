import { and, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm'

import { items, itemScrapes, lists } from '@/db/schema'

import type { Analyzer } from '../analyzer'
import type { AnalyzerSubject } from '../context'
import { combineHashes, sha256Hex } from '../hash'
import type { AnalyzerRecOutput, AnalyzerResult, AnalyzerStep, ItemRef, ListRef } from '../types'

// Items with a URL whose linked product hasn't been re-scraped in a long
// time (or never scraped at all) drift out of date - prices change, items
// go out of stock, listings move. Surface them so the user can re-scrape
// from the edit dialog.
const STALE_SCRAPE_THRESHOLD_DAYS = 120

export const staleScrapeAnalyzer: Analyzer = {
	id: 'stale-scrape',
	label: 'Stale or unscraped URLs',
	enabledByDefault: true,
	async run(ctx): Promise<AnalyzerResult> {
		const t0 = Date.now()
		const cutoff = new Date(ctx.now.getTime() - STALE_SCRAPE_THRESHOLD_DAYS * 86400000)

		// Latest successful scrape per item via a correlated subquery. The
		// items.id partial index on item_scrapes(itemId, createdAt DESC)
		// makes this O(log n) per item.
		const latestScrapeAt = sql<Date | null>`(
			SELECT MAX(${itemScrapes.createdAt})
			FROM ${itemScrapes}
			WHERE ${itemScrapes.itemId} = ${items.id} AND ${itemScrapes.ok} = true
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
				latestScrapeAt: latestScrapeAt.as('latest_scrape_at'),
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
					isNotNull(items.url),
					sql`(${latestScrapeAt} IS NULL OR ${latestScrapeAt} < ${cutoff.toISOString()})`
				)
			)
			.limit(ctx.candidateCap)

		const loadStep: AnalyzerStep = { name: 'load-candidates', latencyMs: Date.now() - t0 }
		const inputHash = sha256Hex(
			`stale-scrape|${candidates
				.map(c => `${c.itemId}:${c.latestScrapeAt?.toISOString() ?? 'never'}`)
				.sort()
				.join(',')}`
		)

		if (candidates.length === 0) {
			return { recs: [], steps: [loadStep], inputHash: combineHashes([inputHash]) }
		}

		const recs: Array<AnalyzerRecOutput> = candidates.map(c => buildRec(c, ctx.now, ctx.subject))
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
	latestScrapeAt: Date | null
}

function buildRec(row: CandidateRow, now: Date, subject: AnalyzerSubject): AnalyzerRecOutput {
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
	const neverScraped = row.latestScrapeAt === null
	const ageDays = neverScraped ? null : Math.max(0, Math.floor((now.getTime() - row.latestScrapeAt!.getTime()) / 86400000))
	const ageLabel = neverScraped ? 'never scraped' : `last scraped ${ageDays} days ago`

	return {
		kind: neverScraped ? 'unscraped-url' : 'stale-scrape',
		severity: 'info',
		title: neverScraped ? `Pull details for ${row.title}` : `Refresh details for ${row.title}`,
		body: neverScraped
			? "This item has a link but we haven't pulled its title, price, or image yet. Opening the edit dialog lets you re-trigger the scrape."
			: `Linked product details haven't been refreshed in over ${STALE_SCRAPE_THRESHOLD_DAYS} days, so price and availability may be out of date.`,
		actions: [
			{
				label: 'Edit item',
				description: 'Open the edit dialog for this item so you can re-scrape the URL or update the details by hand.',
				intent: 'do',
				nav: { listId: String(row.listId), itemId: String(row.itemId), openEdit: true },
			},
		],
		dismissDescription: "Hide this suggestion. We won't surface it again unless the URL or scrape history changes.",
		affected: {
			noun: 'item',
			count: 1,
			lines: [`${row.title} · on ${row.listName}`, ageLabel],
			listChips: [listRef],
		},
		relatedItems: [itemRef],
		relatedLists: [listRef],
		fingerprintTargets: [String(row.itemId)],
	}
}
