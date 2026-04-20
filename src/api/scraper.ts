import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { authMiddleware } from '@/middleware/auth'

// Scraping temporarily disabled. The `open-graph-scraper` / `cheerio` imports
// were breaking the Vercel server build and leaking `process` references into
// the client bundle via the /item/import route. Re-enable by restoring the
// OpenGraphFetcher and `itemScrapes` persistence (see git history for the
// previous implementation).

export type ScrapeResult = {
	success: boolean
	title?: string
	description?: string
	price?: string
	currency?: string
	imageUrls: Array<string>
	siteName?: string
	rawResponse?: Record<string, string | number | boolean | null>
}

const ScrapeUrlInputSchema = z.object({
	url: z.string().url().max(2000),
	itemId: z.number().int().positive().optional(),
})

export type ScrapeUrlResult = { kind: 'ok'; data: ScrapeResult; scrapeId: number | null } | { kind: 'error'; reason: 'scrape-failed' }

export const scrapeUrl = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.input<typeof ScrapeUrlInputSchema>) => ScrapeUrlInputSchema.parse(data))
	.handler(async (): Promise<ScrapeUrlResult> => {
		return { kind: 'error', reason: 'scrape-failed' }
	})
