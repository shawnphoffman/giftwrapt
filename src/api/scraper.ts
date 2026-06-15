import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { db } from '@/db'
import { loggingMiddleware } from '@/lib/logger'
import { loadCachedScrape } from '@/lib/scrapers/cache'
import { runOneShotScrape } from '@/lib/scrapers/run'
import type { OrchestrateResult, ScrapeAttempt, ScrapeResult } from '@/lib/scrapers/types'
import { getAppSettings } from '@/lib/settings-loader'
import { authMiddleware } from '@/middleware/auth'

// Re-export the structured-result shape so existing callers (item form,
// future cron-based refresh, admin tools) keep importing it from this
// module rather than reaching into `lib/scrapers`.
export type { ScrapeResult }

const ScrapeUrlInputSchema = z.object({
	url: z.string().url().max(2000),
	itemId: z.number().int().positive().optional(),
	force: z.boolean().optional(),
	providerOverride: z.array(z.string()).max(8).optional(),
})

export type ScrapeUrlOk = {
	kind: 'ok'
	result: ScrapeResult
	fromProvider: string
	attempts: Array<ScrapeAttempt>
	cached: boolean
}

export type ScrapeUrlErr = {
	kind: 'error'
	reason: 'all-providers-failed' | 'invalid-url' | 'not-authorized' | 'timeout' | 'no-providers-available' | 'scrape-failed'
	attempts?: Array<ScrapeAttempt>
}

export type ScrapeUrlResult = ScrapeUrlOk | ScrapeUrlErr

export const scrapeUrl = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ScrapeUrlInputSchema>) => ScrapeUrlInputSchema.parse(data))
	.handler(async ({ data, context }): Promise<ScrapeUrlResult> => {
		const orchestrateResult = await runOneShotScrape({
			url: data.url,
			userId: context.session.user.id,
			itemId: data.itemId,
			force: data.force,
			providerOverride: data.providerOverride,
		})
		return mapResult(orchestrateResult)
	})

const CachedScrapeImagesInputSchema = z.object({
	url: z.string().url().max(2000),
})

export type CachedScrapeImagesResult = { kind: 'ok'; imageUrls: ReadonlyArray<string> } | { kind: 'miss' }

// Cache-only image-candidate lookup. Unlike `scrapeUrl`, this never runs the
// orchestrator or fetches the page: it reads the most recent successful scrape
// row for the URL within the deployment's cache TTL and returns its candidate
// image URLs (or `miss` when nothing is cached). The edit dialog calls this on
// open so a user can re-pick from the originally-scraped images for free; a
// real re-scrape stays an explicit action behind the Sparkles button.
export const getCachedScrapeImages = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof CachedScrapeImagesInputSchema>) => CachedScrapeImagesInputSchema.parse(data))
	.handler(async ({ data }): Promise<CachedScrapeImagesResult> => {
		const settings = await getAppSettings(db)
		const cached = await loadCachedScrape(db, data.url, {
			ttlHours: settings.scrapeCacheTtlHours,
			minScore: settings.scrapeQualityThreshold,
		})
		if (!cached) return { kind: 'miss' }
		return { kind: 'ok', imageUrls: cached.result.imageUrls }
	})

function mapResult(r: OrchestrateResult): ScrapeUrlResult {
	if (r.kind === 'ok') {
		return {
			kind: 'ok',
			result: r.result,
			fromProvider: r.fromProvider,
			attempts: r.attempts,
			cached: r.cached,
		}
	}
	return { kind: 'error', reason: r.reason, attempts: r.attempts }
}
