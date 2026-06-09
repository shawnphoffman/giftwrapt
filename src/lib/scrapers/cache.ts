import { and, desc, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm'

import type { Database, SchemaDatabase } from '@/db'
import { itemScrapes } from '@/db/schema'

import { extractFromRaw } from './extractor'
import { maybeCleanTitle } from './post-passes/clean-title'
import { scoreScrape } from './score'
import type { ScrapeResult } from './types'

// URL-based dedup against `itemScrapes`. Returns the most recent successful
// scrape of the same URL within `ttlHours`, scored above `minScore`.
//
// Storage is jsonb (`response` column). When we wrote the row, the
// orchestrator persisted the structured ScrapeResult under the providerId
// the row's keyed by, plus the original `title/description/price/...`
// columns the schema already had. We rebuild a ScrapeResult from those
// columns so this lookup never has to round-trip the orchestrator's choice
// of where to stash structured data.
export async function loadCachedScrape(
	db: Database,
	url: string,
	options: { ttlHours: number; minScore: number }
): Promise<{ result: ScrapeResult; fromProvider: string } | null> {
	if (options.ttlHours <= 0) return null
	const since = new Date(Date.now() - options.ttlHours * 60 * 60 * 1000)
	const rows = await db
		.select({
			scraperId: itemScrapes.scraperId,
			score: itemScrapes.score,
			title: itemScrapes.title,
			cleanTitle: itemScrapes.cleanTitle,
			description: itemScrapes.description,
			price: itemScrapes.price,
			currency: itemScrapes.currency,
			imageUrls: itemScrapes.imageUrls,
			purchaseVariants: itemScrapes.purchaseVariants,
			ratingValue: itemScrapes.ratingValue,
			ratingCount: itemScrapes.ratingCount,
		})
		.from(itemScrapes)
		.where(and(eq(itemScrapes.url, url), eq(itemScrapes.ok, true), gte(itemScrapes.createdAt, since)))
		.orderBy(desc(itemScrapes.createdAt))
		.limit(1)
	if (rows.length === 0) return null
	const row = rows[0]
	const score = row.score ?? -1
	if (score < options.minScore) return null
	const result: ScrapeResult = {
		title: row.cleanTitle ?? row.title ?? undefined,
		description: row.description ?? undefined,
		price: row.price ?? undefined,
		currency: row.currency ?? undefined,
		imageUrls: row.imageUrls ?? [],
		finalUrl: url,
		ratingValue: row.ratingValue ?? undefined,
		ratingCount: row.ratingCount ?? undefined,
		purchaseVariants: row.purchaseVariants ?? undefined,
	}
	return { result, fromProvider: row.scraperId }
}

// Looks up the most recent successful scrape for the given URL that has
// at least one rating field set. Used at item-create time to inherit
// ratings the form-driven scrape collected before the item existed.
// Returns null when no usable row is found.
export async function loadCachedScrapeRating(
	db: SchemaDatabase,
	url: string,
	options: { ttlHours: number }
): Promise<{ ratingValue: number | null; ratingCount: number | null } | null> {
	if (options.ttlHours <= 0) return null
	const since = new Date(Date.now() - options.ttlHours * 60 * 60 * 1000)
	const rows = await db
		.select({
			ratingValue: itemScrapes.ratingValue,
			ratingCount: itemScrapes.ratingCount,
		})
		.from(itemScrapes)
		.where(and(eq(itemScrapes.url, url), eq(itemScrapes.ok, true), gte(itemScrapes.createdAt, since), isNotNull(itemScrapes.ratingValue)))
		.orderBy(desc(itemScrapes.createdAt))
		.limit(1)
	if (rows.length === 0) return null
	return rows[0]
}

// Persists a single attempt row. Designed to be called from the orchestrator's
// `persistAttempt` injection point so commit 1 doesn't have to know about
// the database.
export async function persistScrapeAttempt(
	db: Database,
	record: {
		itemId?: number
		userId?: string
		url: string
		providerId: string
		ok: boolean
		score: number | null
		ms: number
		errorCode?: string
		result?: ScrapeResult
		rawResponse?: unknown
	}
): Promise<void> {
	await db.insert(itemScrapes).values({
		itemId: record.itemId ?? null,
		userId: record.userId ?? null,
		url: record.url,
		scraperId: record.providerId,
		ok: record.ok,
		score: record.score,
		ms: record.ms,
		errorCode: record.errorCode ?? null,
		response: record.rawResponse ? sql`${JSON.stringify(record.rawResponse)}::jsonb` : null,
		title: record.result?.title ?? null,
		description: record.result?.description ?? null,
		price: record.result?.price ?? null,
		currency: record.result?.currency ?? null,
		imageUrls: record.result?.imageUrls ?? null,
		purchaseVariants: record.result?.purchaseVariants ?? null,
		ratingValue: record.result?.ratingValue ?? null,
		ratingCount: record.result?.ratingCount ?? null,
	})
}

// Back-writes the AI-cleaned title onto the persisted attempt row(s) for a
// URL. Attempt rows are inserted during the scrape (raw `title` only); the
// title-cleanup post-pass runs afterward on the winner, so its output has to
// be stitched back in here. We match the winning provider's row(s) by their
// raw title and only touch rows that don't already carry a `cleanTitle`,
// scoped to the recent past so a shared title on an old row (scraped while
// the toggle was off) is never retroactively rewritten. With the column set,
// `loadCachedScrape` returns `cleanTitle ?? title`, so a re-scrape within the
// cache TTL serves the cleaned title instead of re-running the LLM.
export async function backfillCleanTitle(db: Database, params: { url: string; originalTitle: string; cleanTitle: string }): Promise<void> {
	const since = new Date(Date.now() - 60 * 60 * 1000)
	await db
		.update(itemScrapes)
		.set({ cleanTitle: params.cleanTitle })
		.where(
			and(
				eq(itemScrapes.url, params.url),
				eq(itemScrapes.ok, true),
				eq(itemScrapes.title, params.originalTitle),
				isNull(itemScrapes.cleanTitle),
				gte(itemScrapes.createdAt, since)
			)
		)
}

// Convenience wrapper: build the orchestrator deps that point at this DB,
// pre-wiring extraction + scoring + cache + persistence + the AI title
// post-pass (which is itself toggle-gated, so it's a no-op when off).
//
// `userId` is the signed-in user that triggered the scrape; it's stamped
// onto every persisted attempt row so the admin /admin/scrapes page can
// surface "who scraped this URL." Pass `undefined` for system-driven runs.
export function buildDbBackedDeps(db: Database, options: { ttlHours: number; minScore: number; userId?: string }) {
	return {
		extractFromRaw,
		scoreFn: scoreScrape,
		loadCache: (url: string) => loadCachedScrape(db, url, options),
		persistAttempt: (record: Parameters<typeof persistScrapeAttempt>[1]) => persistScrapeAttempt(db, { ...record, userId: options.userId }),
		postProcessResult: async (result: ScrapeResult, ctx: { url: string; fromProvider: string }) => {
			const outcome = await maybeCleanTitle(db, result, { url: ctx.url })
			if (outcome.cleaned && result.title && outcome.cleaned !== result.title) {
				// Persist the cleaned title so cache hits (and the admin scrapes
				// view) reflect it; best-effort, never block the live result on it.
				try {
					await backfillCleanTitle(db, { url: ctx.url, originalTitle: result.title, cleanTitle: outcome.cleaned })
				} catch {
					// Swallow: the in-memory result is already corrected for this run.
				}
				return { ...result, title: outcome.cleaned }
			}
			return result
		},
	}
}
