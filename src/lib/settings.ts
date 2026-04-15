// lib/settings.ts
import { z } from 'zod'

import type { Database } from '@/db'
import { appSettings } from '@/db/schema'

// 1) Shape of settings used across the app
export const appSettingsSchema = z.object({
	enableHolidayLists: z.boolean().default(true),
	enableTodoLists: z.boolean().default(true),
	defaultListType: z.enum(['wishlist', 'christmas', 'birthday', 'giftideas', 'todos', 'test']).default('wishlist'),
	enableGiftsForNonUsers: z.boolean().default(false),
	// maxItemsPerList: z.number().int().positive().default(100),
})

// 2) Default values in code (for when DB is empty or missing keys)
export const DEFAULT_APP_SETTINGS: z.infer<typeof appSettingsSchema> = {
	enableHolidayLists: true,
	enableTodoLists: true,
	defaultListType: 'wishlist',
	enableGiftsForNonUsers: false,
	// maxItemsPerList: 100,
}

export type AppSettings = z.infer<typeof appSettingsSchema>

// 3) Helper to load raw key/value rows from DB
async function loadRawSettings(db: Database): Promise<Record<string, unknown>> {
	const rows = await db.select().from(appSettings)
	// rows: { key: string; value: any }[]
	return Object.fromEntries(rows.map(r => [r.key, r.value]))
}

// 4) Main function to get **typed, merged** settings
export async function getAppSettings(db: Database): Promise<AppSettings> {
	const raw = await loadRawSettings(db)

	// Merge DB overrides on top of defaults
	const merged = {
		...DEFAULT_APP_SETTINGS,
		...raw,
	}

	// Validate & coerce (e.g., if JSON had numbers as strings, etc.)
	return appSettingsSchema.parse(merged)
}
