// lib/settings.ts
import { z } from 'zod'

import type { Database } from '@/db'
import { appSettings } from '@/db/schema'

// 1) Shape of settings used across the app
export const appSettingsSchema = z.object({
	enableHolidayLists: z.boolean().default(true),
	enableBirthdayLists: z.boolean().default(true),
	enableTodoLists: z.boolean().default(true),
	defaultListType: z.enum(['wishlist', 'christmas', 'birthday', 'giftideas', 'todos', 'test']).default('wishlist'),
	enableGiftsForNonUsers: z.boolean().default(false),
	// Days after a birthday before claimed items are auto-archived.
	archiveDaysAfterBirthday: z.number().int().positive().default(14),
	// Days after Dec 25 before claimed Christmas items are auto-archived.
	archiveDaysAfterChristmas: z.number().int().positive().default(14),
	// Whether birthday emails (day-of + follow-up) are sent.
	enableBirthdayEmails: z.boolean().default(true),
	// Whether Christmas emails are sent.
	enableChristmasEmails: z.boolean().default(true),
	// Whether users can post comments on items.
	enableComments: z.boolean().default(true),
	// Whether a notification email is sent to the list owner on new comments.
	enableCommentEmails: z.boolean().default(true),
})

// 2) Default values in code (for when DB is empty or missing keys)
export const DEFAULT_APP_SETTINGS: z.infer<typeof appSettingsSchema> = {
	enableHolidayLists: true,
	enableBirthdayLists: true,
	enableTodoLists: true,
	defaultListType: 'wishlist',
	enableGiftsForNonUsers: false,
	archiveDaysAfterBirthday: 14,
	archiveDaysAfterChristmas: 14,
	enableBirthdayEmails: true,
	enableChristmasEmails: true,
	enableComments: true,
	enableCommentEmails: true,
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
