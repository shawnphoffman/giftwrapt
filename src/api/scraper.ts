import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { loggingMiddleware } from '@/lib/logger'
import { runOneShotScrape } from '@/lib/scrapers/run'
import type { OrchestrateResult, ScrapeAttempt, ScrapeResult } from '@/lib/scrapers/types'
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
