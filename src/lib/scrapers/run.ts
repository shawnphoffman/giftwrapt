import { db } from '@/db'
import { getAppSettings } from '@/lib/settings-loader'

import { buildDbBackedDeps } from './cache'
import { orchestrate } from './orchestrator'
import { fetchProvider } from './providers/fetch'
import { loadConfiguredProviders } from './providers/load-configured'
import type { OrchestrateResult } from './types'

// One-shot scrape: kicks the orchestrator with the same dep wiring the
// streaming SSE route uses, but waits for the final result instead of
// emitting per-attempt events. Shared by `scrapeUrl` (server function) and
// the `/api/mobile/scrape` REST endpoint so both paths apply the same
// settings, providers, and cache.
export async function runOneShotScrape(args: {
	url: string
	userId: string
	itemId?: number
	force?: boolean
	providerOverride?: Array<string>
	acceptLanguage?: string
	signal?: AbortSignal
}): Promise<OrchestrateResult> {
	const [settings, configuredProviders] = await Promise.all([getAppSettings(db), loadConfiguredProviders()])

	return orchestrate(
		{
			url: args.url,
			itemId: args.itemId,
			force: args.force,
			providerOverride: args.providerOverride,
			acceptLanguage: args.acceptLanguage,
			signal: args.signal,
		},
		{
			...buildDbBackedDeps(db, {
				ttlHours: settings.scrapeCacheTtlHours,
				minScore: settings.scrapeQualityThreshold,
				userId: args.userId,
			}),
			providers: [fetchProvider, ...configuredProviders],
			perProviderTimeoutMs: settings.scrapeProviderTimeoutMs,
			overallTimeoutMs: settings.scrapeOverallTimeoutMs,
			qualityThreshold: settings.scrapeQualityThreshold,
		}
	)
}
