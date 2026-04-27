import { createServerFn } from '@tanstack/react-start'

import { db } from '@/db'
import { appSettings } from '@/db/schema'
import { loggingMiddleware } from '@/lib/logger'
import { type AppSettings, appSettingsSchema } from '@/lib/settings'
import { encryptScrapeProviderSecrets, getAppSettings } from '@/lib/settings-loader'
import { adminAuthMiddleware } from '@/middleware/auth'

/**
 * Server function to fetch app settings
 * This runs on the server and returns typed, validated settings
 */
export const fetchAppSettings = createServerFn({
	method: 'GET',
})
	.middleware([loggingMiddleware])
	.handler(async () => {
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
			const storedValue = key === 'scrapeProviders' && Array.isArray(value) ? encryptScrapeProviderSecrets(value) : value
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
