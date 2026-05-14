import { and, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm'

import { items, itemScrapes, lists } from '@/db/schema'

import type { Analyzer } from '../analyzer'
import type { AnalyzerSubject } from '../context'
import { combineHashes, sha256Hex } from '../hash'
import type { AnalyzerRecOutput, AnalyzerResult, AnalyzerStep, ListRef, RecSubItem } from '../types'

// Items with a URL whose linked product hasn't been re-scraped in a long
// time (or never scraped at all) drift out of date - prices change, items
// go out of stock, listings move. Bundled per list and per kind: a list
// with both never-scraped and stale-scraped items gets TWO bundle recs
// (one of kind 'unscraped-url', one of kind 'stale-scrape') because the
// two kinds have distinct copy and intent.
const STALE_SCRAPE_THRESHOLD_DAYS = 120

export const staleScrapeAnalyzer: Analyzer = {
	id: 'stale-scrape',
	label: 'Stale or unscraped URLs',
	enabledByDefault: true,
	async run(ctx): Promise<AnalyzerResult> {
		const t0 = Date.now()
		const cutoff = new Date(ctx.now.getTime() - STALE_SCRAPE_THRESHOLD_DAYS * 86400000)

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
					ne(lists.type, 'todos'),
					eq(items.isArchived, false),
					isNull(items.pendingDeletionAt),
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

		const recs = buildBundles(candidates, ctx.now, ctx.subject)
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

type BundleKey = `${number}:unscraped-url` | `${number}:stale-scrape`

function buildBundles(rows: ReadonlyArray<CandidateRow>, now: Date, subject: AnalyzerSubject): Array<AnalyzerRecOutput> {
	const byBundle = new Map<BundleKey, { kind: 'unscraped-url' | 'stale-scrape'; listId: number; rows: Array<CandidateRow> }>()
	for (const row of rows) {
		const kind: 'unscraped-url' | 'stale-scrape' = row.latestScrapeAt === null ? 'unscraped-url' : 'stale-scrape'
		const key: BundleKey = `${row.listId}:${kind}`
		let bucket = byBundle.get(key)
		if (!bucket) {
			bucket = { kind, listId: row.listId, rows: [] }
			byBundle.set(key, bucket)
		}
		bucket.rows.push(row)
	}
	const recs: Array<AnalyzerRecOutput> = []
	for (const [, bundle] of byBundle) {
		bundle.rows.sort((a, b) => a.title.localeCompare(b.title))
		const first = bundle.rows[0]
		const listRef = makeListRef(first, subject)
		const subItems: Array<RecSubItem> = bundle.rows.map(c => {
			const ageDays = c.latestScrapeAt === null ? null : Math.max(0, Math.floor((now.getTime() - c.latestScrapeAt.getTime()) / 86400000))
			const detail = ageDays === null ? 'Never scraped' : `Last scraped ${ageDays} day${ageDays === 1 ? '' : 's'} ago`
			return {
				id: String(c.itemId),
				title: c.title,
				detail,
				thumbnailUrl: c.imageUrl,
				nav: { listId: String(c.listId), itemId: String(c.itemId), openEdit: true },
			}
		})
		const count = subItems.length
		const isUnscraped = bundle.kind === 'unscraped-url'
		recs.push({
			kind: bundle.kind,
			severity: 'info',
			title: isUnscraped
				? count === 1
					? `Pull details for an item on ${first.listName}`
					: `Pull details for items on ${first.listName}`
				: count === 1
					? `Refresh details for an item on ${first.listName}`
					: `Refresh details for items on ${first.listName}`,
			body: isUnscraped
				? "These items have links but we haven't pulled their title, price, or image yet. Open the list to bulk-refresh, or use Edit / Skip on each item below."
				: `Linked product details haven't been refreshed in over ${STALE_SCRAPE_THRESHOLD_DAYS} days, so price and availability may be out of date. Open the list to bulk-refresh, or use Edit / Skip on each item below.`,
			actions: [],
			dismissDescription: "Hide this suggestion for this list. We won't surface it again unless the underlying scrape history changes.",
			affected: {
				noun: count === 1 ? 'item' : 'items',
				count,
				lines: [`${first.listName} · ${count} ${isUnscraped ? 'unscraped' : 'stale'} item${count === 1 ? '' : 's'}`],
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
