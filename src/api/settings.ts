import { createServerFn } from '@tanstack/react-start'

import { db } from '@/db'
import { appSettings } from '@/db/schema'
import { loggingMiddleware } from '@/lib/logger'
import { type AppSettings, appSettingsSchema } from '@/lib/settings'
import { encryptBarcodeSecrets, encryptScrapeProviderSecrets, getAppSettings } from '@/lib/settings-loader'
import { adminAuthMiddleware } from '@/middleware/auth'

/**
 * Public, unauthenticated read of app settings.
 *
 * Strips `scrapeProviders` because those entries carry decrypted secret
 * fields (token / apiKey / customHeaders) after `getAppSettings` runs its
 * envelope-decrypt pass. The root route prefetches this on every request,
 * including for unauthenticated visitors, so any field returned here is
 * effectively world-readable. See sec-review C1.
 *
 * Admin UI that needs the full provider list (with secrets) calls
 * `fetchAppSettingsAsAdmin` instead.
 */
export const fetchAppSettings = createServerFn({
	method: 'GET',
})
	.middleware([loggingMiddleware])
	.handler(async (): Promise<AppSettings> => {
		const full = await getAppSettings(db)
		// `barcode.goUpcKey` is a decrypted secret after the loader
		// runs; strip before returning to unauthenticated callers. The
		// other `barcode` fields stay so clients can read capability
		// gating from the public prefetch.
		return {
			...full,
			scrapeProviders: [],
			barcode: { ...full.barcode, goUpcKey: '' },
		}
	})

/**
 * Admin-only read of app settings, including decrypted scrapeProviders.
 *
 * Use from admin pages that need to display or edit scrape provider
 * credentials. Gated by `adminAuthMiddleware`, so non-admin callers are
 * redirected to /sign-in (or refused) before any decrypted secret is
 * serialized.
 */
export const fetchAppSettingsAsAdmin = createServerFn({
	method: 'GET',
})
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.handler(async (): Promise<AppSettings> => {
		return await getAppSettings(db)
	})

/**
 * Server function to update app settings (admin only)
 * Accepts partial settings and updates only the provided keys
 */
export const updateAppSettings = createServerFn({
	method: 'POST',
})
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: Partial<AppSettings>) => {
		// Validate only the provided keys
		const partialSchema = appSettingsSchema.partial()
		return partialSchema.parse(data)
	})
	.handler(async ({ data }) => {
		// Update each provided setting
		for (const [key, value] of Object.entries(data)) {
			// `scrapeProviders` carries secret fields (token / apiKey /
			// customHeaders). Encrypt them at the storage boundary so
			// app_settings never holds plaintext credentials at rest;
			// `getAppSettings` decrypts on read via Zod transforms.
			let storedValue: unknown = value
			if (key === 'scrapeProviders' && Array.isArray(value)) {
				storedValue = encryptScrapeProviderSecrets(value)
			} else if (key === 'barcode' && value && typeof value === 'object') {
				storedValue = encryptBarcodeSecrets(value as Parameters<typeof encryptBarcodeSecrets>[0])
			}
			await db
				.insert(appSettings)
				.values({ key, value: storedValue })
				.onConflictDoUpdate({
					target: appSettings.key,
					set: { value: storedValue },
				})
		}

		// Return the updated settings
		return await getAppSettings(db)
	})
