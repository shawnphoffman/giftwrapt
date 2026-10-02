import { and, desc, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm'

import type { Database, SchemaDatabase } from '@/db'
import { itemScrapes } from '@/db/schema'

import { extractFromRaw } from './extractor'
import { maybeCleanTitle } from './post-passes/clean-title'
import type { ScoreBreakdown } from './score'
import { CACHE_MIN_SCORE, scoreBreakdown, scoreScrape } from './score'
import type { FinalScrapeRecord, ScrapeResult } from './types'

// URL-based dedup against `itemScrapes`. Returns the final merged row of the
// best recent run of the same URL within `ttlHours` at or above `minScore`.
// Final rows (`isFinal`) hold the whole run's merge, so they win over any
// single attempt; attempt rows are only a fallback for runs persisted before
// final rows existed. Within each kind, best score first, then newest: once
// the orchestrator falls through tiers, the last attempt to finish is often
// a weaker one (a later tier that hit a captcha), and it must not hide the
// one that won.
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
		.where(
			and(eq(itemScrapes.url, url), eq(itemScrapes.ok, true), gte(itemScrapes.createdAt, since), gte(itemScrapes.score, options.minScore))
		)
		.orderBy(desc(itemScrapes.isFinal), desc(itemScrapes.score), desc(itemScrapes.createdAt))
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
		scoreParts?: ScoreBreakdown['parts']
	}
): Promise<void> {
	const response = buildResponseJson(record.rawResponse, record.scoreParts)
	await db.insert(itemScrapes).values({
		itemId: record.itemId ?? null,
		userId: record.userId ?? null,
		url: record.url,
		scraperId: record.providerId,
		ok: record.ok,
		score: record.score,
		ms: record.ms,
		errorCode: record.errorCode ?? null,
		response: response ? sql`${JSON.stringify(response)}::jsonb` : null,
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

// Persists the orchestrator's final merged result as its own row, flagged
// `isFinal`. `title` keeps the merged title and `cleanTitle` the post-pass
// title when it differs, mirroring how attempt rows store a cleaned title.
// The response jsonb records which providers joined the merge and which the
// consistency guard kept out, for the admin Scrape History.
export async function persistFinalScrape(db: Database, record: FinalScrapeRecord & { userId?: string }): Promise<void> {
	const { result, finalResult } = record
	const cleanTitle = finalResult.title && finalResult.title !== result.title ? finalResult.title : null
	const response = {
		kind: 'final',
		contributors: record.contributors,
		rejected: record.rejected,
		...(record.scoreParts ? { scoreParts: record.scoreParts } : {}),
	}
	await db.insert(itemScrapes).values({
		itemId: record.itemId ?? null,
		userId: record.userId ?? null,
		url: record.url,
		scraperId: record.fromProvider,
		ok: true,
		isFinal: true,
		score: record.score,
		ms: record.ms,
		errorCode: null,
		response: sql`${JSON.stringify(response)}::jsonb`,
		title: result.title ?? null,
		cleanTitle,
		description: finalResult.description ?? null,
		price: finalResult.price ?? null,
		currency: finalResult.currency ?? null,
		imageUrls: finalResult.imageUrls,
		purchaseVariants: finalResult.purchaseVariants ?? null,
		ratingValue: finalResult.ratingValue ?? null,
		ratingCount: finalResult.ratingCount ?? null,
	})
}

// Convenience wrapper: build the orchestrator deps that point at this DB,
// pre-wiring extraction + scoring + cache + persistence + the AI title
// post-pass (which is itself toggle-gated, so it's a no-op when off).
//
// `userId` is the signed-in user that triggered the scrape; it's stamped
// onto every persisted attempt row so the admin Scrape History can
// surface "who scraped this URL." Pass `undefined` for system-driven runs.
export function buildDbBackedDeps(db: Database, options: { ttlHours: number; minScore?: number; userId?: string }) {
	const cacheOptions = { ttlHours: options.ttlHours, minScore: options.minScore ?? CACHE_MIN_SCORE }
	return {
		extractFromRaw,
		scoreFn: scoreScrape,
		explainScore: scoreBreakdown,
		loadCache: (url: string) => loadCachedScrape(db, url, cacheOptions),
		persistAttempt: (record: Parameters<typeof persistScrapeAttempt>[1]) => persistScrapeAttempt(db, { ...record, userId: options.userId }),
		persistFinal: (record: FinalScrapeRecord) => persistFinalScrape(db, { ...record, userId: options.userId }),
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

// What lands in the `response` jsonb: the provider's raw response, plus the
// score breakdown under `scoreParts` (shown as-is in the Scrape History
// drawer), so no column is needed for it. A non-object raw response is
// dropped when there are parts to attach; providers only ever send objects.
export function buildResponseJson(rawResponse: unknown, scoreParts: ScoreBreakdown['parts'] | undefined): unknown {
	if (!scoreParts) return rawResponse
	return { ...(isPlainObject(rawResponse) ? rawResponse : {}), scoreParts }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
