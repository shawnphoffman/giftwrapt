import { and, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm'

import { items, itemScrapes, lists } from '@/db/schema'
import type { Locale } from '@/lib/i18n/locales'
import { visibleItemsWhere } from '@/lib/item-visibility'
import { m } from '@/paraglide/messages.js'

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
	label: 'Stale or Unscraped URLs',
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
					visibleItemsWhere('visible'),
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

		const recs = buildBundles(candidates, ctx.now, ctx.subject, ctx.locale)
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

function buildBundles(rows: ReadonlyArray<CandidateRow>, now: Date, subject: AnalyzerSubject, locale: Locale): Array<AnalyzerRecOutput> {
	const o = { locale }
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
			const detail = ageDays === null ? m.intel_stale_scrape_detail_never({}, o) : m.intel_stale_scrape_detail_age({ count: ageDays }, o)
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
				? m.intel_stale_scrape_unscraped_title({ count, listName: first.listName }, o)
				: m.intel_stale_scrape_stale_title({ count, listName: first.listName }, o),
			body: isUnscraped
				? m.intel_stale_scrape_unscraped_body({}, o)
				: m.intel_stale_scrape_stale_body({ days: STALE_SCRAPE_THRESHOLD_DAYS }, o),
			actions: [],
			dismissDescription: m.intel_stale_scrape_dismiss({}, o),
			affected: {
				noun: count === 1 ? m.intel_common_noun_item({}, o) : m.intel_common_noun_items({}, o),
				count,
				lines: [
					isUnscraped
						? m.intel_stale_scrape_unscraped_line({ count, listName: first.listName }, o)
						: m.intel_stale_scrape_stale_line({ count, listName: first.listName }, o),
				],
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
