import { createServerFn } from '@tanstack/react-start'

import { db } from '@/db'
import { appSettings } from '@/db/schema'
import { type AppSettings, appSettingsSchema, getAppSettings } from '@/lib/settings'
import { adminAuthMiddleware } from '@/middleware/auth'

/**
 * Server function to fetch app settings
 * This runs on the server and returns typed, validated settings
 */
export const fetchAppSettings = createServerFn({
	method: 'GET',
}).handler(async () => {
	return await getAppSettings(db)
})

/**
 * Server function to update app settings (admin only)
 * Accepts partial settings and updates only the provided keys
 */
export const updateAppSettings = createServerFn({
	method: 'POST',
})
	.middleware([adminAuthMiddleware])
	.inputValidator((data: Partial<AppSettings>) => {
		// Validate only the provided keys
		const partialSchema = appSettingsSchema.partial()
		return partialSchema.parse(data)
	})
	.handler(async ({ data }) => {
		// Update each provided setting
		for (const [key, value] of Object.entries(data)) {
			await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({
				target: appSettings.key,
				set: { value },
			})
		}

		// Return the updated settings
		return await getAppSettings(db)
	})
