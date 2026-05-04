import { and, desc, eq, gte, sql } from 'drizzle-orm'

import type { Database } from '@/db'
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
	}
	return { result, fromProvider: row.scraperId }
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
	})
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
			if (outcome.cleaned && outcome.cleaned !== result.title) {
				return { ...result, title: outcome.cleaned }
			}
			return result
		},
	}
}
