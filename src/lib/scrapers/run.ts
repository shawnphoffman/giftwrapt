// One-shot scrape: kicks the orchestrator with the same dep wiring the
// streaming SSE route uses, but waits for the final result instead of
// emitting per-attempt events. Shared by `scrapeUrl` (server fn, called
// from the web add-item form) and the `/api/mobile/v1/scrape` Hono
// endpoint (called by the iOS share extension) so both paths apply the
// same settings, providers, and cache.
//
// Top-level imports of `@/db` are safe to keep here: the client build
// aliases `@/db` to a throwing stub (see `vite.config.ts` ->
// `dbClientAlias`), so even if a client-reachable module statically
// imports this file, pg + drizzle-orm/node-postgres don't leak into the
// browser bundle.

import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { items } from '@/db/schema'
import { getAppSettings } from '@/lib/settings-loader'

import { buildDbBackedDeps } from './cache'
import { orchestrate } from './orchestrator'
import { fetchProvider } from './providers/fetch'
import { loadConfiguredProviders } from './providers/load-configured'
import type { OrchestrateResult } from './types'

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

	const result = await orchestrate(
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

	// When the scrape was associated with an existing item, persist any
	// ratings the result surfaced. Ratings aren't user-controllable, so
	// they don't go through the form-prefill rule (`applyScrapePrefill`)
	// and need a direct write. Missing ratings don't clear an existing
	// value (provider variance).
	if (result.kind === 'ok' && args.itemId !== undefined) {
		const updates: Record<string, number> = {}
		if (typeof result.result.ratingValue === 'number') updates.ratingValue = result.result.ratingValue
		if (typeof result.result.ratingCount === 'number') updates.ratingCount = result.result.ratingCount
		if (Object.keys(updates).length > 0) {
			await db.update(items).set(updates).where(eq(items.id, args.itemId))
		}
	}

	return result
}
