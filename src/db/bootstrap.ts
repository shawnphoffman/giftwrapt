// Server-only. Do not import from client/route components.
//
// One-shot bootstrap step: seed the new `scrapeProviders` array from legacy
// env vars (BROWSERLESS_URL, BROWSER_TOKEN, FLARESOLVERR_URL) and from the
// pre-tier `scrapeAiProviderEnabled` toggle, when no entry of the target
// type already exists. Lets self-hosters who configured those env vars +
// the AI toggle upgrade without manually re-entering them in
// /admin/scraping.
//
// Idempotent: re-running is a no-op once an entry of the target type
// exists, regardless of its URL/token. The admin can subsequently edit or
// disable the seeded entry; we won't ever overwrite their changes.
//
// Called once per server boot from src/db/index.ts; safe to call multiple
// times since each invocation re-checks the current state.

import { db } from '@/db'
import { appSettings } from '@/db/schema'
import { env } from '@/env'
import { createLogger } from '@/lib/logger'
import { type AppSettings, type ScrapeProviderEntry } from '@/lib/settings'
import { encryptScrapeProviderSecrets, getAppSettings } from '@/lib/settings-loader'

const bootstrapLog = createLogger('db:bootstrap')

let didRun = false

export async function seedScrapeProvidersFromEnv(): Promise<void> {
	if (didRun) return
	didRun = true

	const browserlessUrl = env.BROWSERLESS_URL
	const flaresolverrUrl = env.FLARESOLVERR_URL

	let settings: AppSettings
	try {
		settings = await getAppSettings(db)
	} catch (err) {
		bootstrapLog.error({ err }, 'failed to load settings during scrape-provider seed')
		return
	}

	const seeded: Array<ScrapeProviderEntry> = [...settings.scrapeProviders]
	let added = false

	// Pre-tier `scrapeAiProviderEnabled` toggle migrates to a regular
	// `ai` entry (tier 3 by default to preserve "expensive parallel
	// fallback" semantics). Skip when there's already an ai entry.
	if (settings.scrapeAiProviderEnabled && !seeded.some(e => e.type === 'ai')) {
		seeded.push({
			id: 'ai-default',
			type: 'ai',
			name: 'AI extraction',
			enabled: true,
			tier: 3,
		})
		added = true
		bootstrapLog.info('seeded ai provider entry from legacy scrapeAiProviderEnabled toggle')
	}

	if (browserlessUrl && !seeded.some(e => e.type === 'browserless')) {
		seeded.push({
			id: 'browserless-env-seed',
			type: 'browserless',
			name: 'Browserless',
			enabled: true,
			tier: 1,
			url: browserlessUrl,
			token: env.BROWSER_TOKEN,
		})
		added = true
		bootstrapLog.info({ url: browserlessUrl }, 'seeded browserless provider from env')
	}

	if (flaresolverrUrl && !seeded.some(e => e.type === 'flaresolverr')) {
		seeded.push({
			id: 'flaresolverr-env-seed',
			type: 'flaresolverr',
			name: 'Flaresolverr',
			enabled: true,
			tier: 1,
			url: flaresolverrUrl,
		})
		added = true
		bootstrapLog.info({ url: flaresolverrUrl }, 'seeded flaresolverr provider from env')
	}

	if (!added) return

	const stored = encryptScrapeProviderSecrets(seeded)
	try {
		await db
			.insert(appSettings)
			.values({ key: 'scrapeProviders', value: stored })
			.onConflictDoUpdate({ target: appSettings.key, set: { value: stored } })
	} catch (err) {
		bootstrapLog.error({ err }, 'failed to persist scrape-provider seed')
	}
}
