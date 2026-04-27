// Server-only. Do not import from client/route components.
//
// Dispatcher that materialises the admin-configured `scrapeProviders` array
// into runtime ScrapeProvider instances. Each entry's `type` selects the
// matching factory; entries with `enabled: false` (or invalid type-specific
// fields - e.g. an empty URL) are silently skipped.
//
// Order in the array IS the chain order: the orchestrator runs sequential
// providers in array order and parallel providers race alongside. Admin
// drag-reorder in /admin/scraping persists the new order via
// `updateAppSettings({ scrapeProviders })`.
//
// Called from the SSE route (src/routes/api/scrape/stream.ts) and the
// non-streaming server fn (src/api/scraper.ts) on every scrape; ~1ms
// because settings are already cached by the surrounding `getAppSettings`
// call (each request loads settings once and shares it).

import { db } from '@/db'
import { seedScrapeProvidersFromEnv } from '@/db/bootstrap'
import { getAppSettings } from '@/lib/settings-loader'

import type { ScrapeProvider } from '../types'
import { createAiProvider } from './ai'
import { createBrowserbaseFetchProvider } from './browserbase-fetch'
import { createBrowserbaseStagehandProvider } from './browserbase-stagehand'
import { createBrowserlessProvider } from './browserless'
import { createCustomHttpProvider } from './custom-http'
import { createFlaresolverrProvider } from './flaresolverr'
import { createScrapflyProvider } from './scrapfly'
import { createWishListScraperProvider } from './wish-list-scraper'

export async function loadConfiguredProviders(): Promise<Array<ScrapeProvider>> {
	// Idempotent first-boot seed of browserless / flaresolverr entries from
	// env vars. After the first call this is a no-op (in-memory guard +
	// DB-state check), but the DB-state check stays correct even when the
	// in-memory guard resets between serverless cold starts.
	await seedScrapeProvidersFromEnv()

	const settings = await getAppSettings(db)
	const out: Array<ScrapeProvider> = []
	for (const entry of settings.scrapeProviders) {
		if (!entry.enabled) continue
		switch (entry.type) {
			case 'browserless':
				out.push(createBrowserlessProvider(entry))
				break
			case 'flaresolverr':
				out.push(createFlaresolverrProvider(entry))
				break
			case 'browserbase-fetch':
				out.push(createBrowserbaseFetchProvider(entry))
				break
			case 'browserbase-stagehand':
				out.push(createBrowserbaseStagehandProvider(entry))
				break
			case 'custom-http':
				out.push(createCustomHttpProvider(entry))
				break
			case 'ai':
				out.push(createAiProvider(entry))
				break
			case 'wish-list-scraper':
				out.push(createWishListScraperProvider(entry))
				break
			case 'scrapfly':
				out.push(createScrapflyProvider(entry))
				break
		}
	}
	return out
}
