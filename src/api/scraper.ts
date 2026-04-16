import { createServerFn } from '@tanstack/react-start'
import ogs from 'open-graph-scraper'
import { z } from 'zod'

import { db } from '@/db'
import { itemScrapes } from '@/db/schema'
import { authMiddleware } from '@/middleware/auth'

// ===============================
// Pluggable HTML Fetcher Interface
// ===============================
// Spec §2.7: Define an interface for swappable fetcher implementations.
// The default uses open-graph-scraper with multi-user-agent fallback.

export interface HtmlFetcher {
	fetch(url: string): Promise<ScrapeResult>
}

export type ScrapeResult = {
	success: boolean
	title?: string
	description?: string
	price?: string
	currency?: string
	imageUrls: string[]
	siteName?: string
	rawResponse?: Record<string, string | number | boolean | null>
}

// ===============================
// Default fetcher: open-graph-scraper
// ===============================

const USER_AGENTS = {
	FacebookBot: 'facebookexternalhit/1.1',
	Generic: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
	GoogleBot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
} as const

class OpenGraphFetcher implements HtmlFetcher {
	async fetch(url: string): Promise<ScrapeResult> {
		let bestResult: ScrapeResult = { success: false, imageUrls: [] }

		for (const [agentName, agentString] of Object.entries(USER_AGENTS)) {
			try {
				const { error, result } = await ogs({
					url,
					fetchOptions: {
						headers: { 'user-agent': agentString },
					},
				})

				if (error || !result?.success) continue

				const images: string[] = []
				if (result.ogImage) {
					for (const img of result.ogImage) {
						if (img.url) images.push(img.url)
					}
				}

				const current: ScrapeResult = {
					success: true,
					title: result.ogTitle || result.dcTitle,
					description: result.ogDescription || result.dcDescription,
					price: (result as Record<string, unknown>).ogPriceAmount as string | undefined,
					currency: (result as Record<string, unknown>).ogPriceCurrency as string | undefined,
					imageUrls: images,
					siteName: result.ogSiteName,
					rawResponse: result as unknown as Record<string, string | number | boolean | null>,
				}

				// Use this result if it's more complete than what we have.
				if (current.title && current.imageUrls.length > 0) {
					return current // Best case: title + images
				}

				// Keep partial result as fallback.
				if (!bestResult.success || (current.title && !bestResult.title)) {
					bestResult = current
				}
			} catch (err) {
				console.error(`Scraper [${agentName}] failed for ${url}:`, err)
			}
		}

		return bestResult
	}
}

// Singleton default fetcher.
const defaultFetcher: HtmlFetcher = new OpenGraphFetcher()

// ===============================
// Server function: scrape a URL
// ===============================

const ScrapeUrlInputSchema = z.object({
	url: z.string().url().max(2000),
	itemId: z.number().int().positive().optional(),
})

export type ScrapeUrlResult =
	| { kind: 'ok'; data: ScrapeResult; scrapeId: number | null }
	| { kind: 'error'; reason: 'scrape-failed' }

export const scrapeUrl = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.input<typeof ScrapeUrlInputSchema>) => ScrapeUrlInputSchema.parse(data))
	.handler(async ({ data }): Promise<ScrapeUrlResult> => {
		const result = await defaultFetcher.fetch(data.url)

		if (!result.success) {
			return { kind: 'error', reason: 'scrape-failed' }
		}

		// Save to itemScrapes if we have an itemId. Historical tracking — always
		// insert a new row, never upsert.
		let scrapeId: number | null = null
		if (data.itemId) {
			const [inserted] = await db
				.insert(itemScrapes)
				.values({
					itemId: data.itemId,
					url: data.url,
					scraperId: 'open-graph-scraper',
					response: result.rawResponse ?? null,
					title: result.title ?? null,
					description: result.description ?? null,
					price: result.price ?? null,
					currency: result.currency ?? null,
					imageUrls: result.imageUrls.length > 0 ? result.imageUrls : null,
				})
				.returning({ id: itemScrapes.id })
			scrapeId = inserted.id
		}

		return { kind: 'ok', data: result, scrapeId }
	})
