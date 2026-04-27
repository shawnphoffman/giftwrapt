// lib/settings.ts
import { z } from 'zod'

import type { Database } from '@/db'
import { appSettings } from '@/db/schema'

// 1) Shape of settings used across the app.
// Defaults live in DEFAULT_APP_SETTINGS below, NOT on the schema fields:
// `appSettingsSchema.partial()` would otherwise fill every absent field with
// its default and the upsert loop in updateAppSettings would clobber unrelated
// rows back to defaults on each toggle.
export const appSettingsSchema = z.object({
	enableHolidayLists: z.boolean(),
	enableBirthdayLists: z.boolean(),
	enableTodoLists: z.boolean(),
	defaultListType: z.enum(['wishlist', 'christmas', 'birthday', 'giftideas', 'todos', 'test']),
	enableGiftsForNonUsers: z.boolean(),
	// Days after a birthday before claimed items are auto-archived.
	archiveDaysAfterBirthday: z.number().int().positive(),
	// Days after Dec 25 before claimed Christmas items are auto-archived.
	archiveDaysAfterChristmas: z.number().int().positive(),
	// Whether birthday emails (day-of + follow-up) are sent.
	enableBirthdayEmails: z.boolean(),
	// Whether Christmas emails are sent.
	enableChristmasEmails: z.boolean(),
	// Whether users can post comments on items.
	enableComments: z.boolean(),
	// Whether a notification email is sent to the list owner on new comments.
	enableCommentEmails: z.boolean(),
	// =====================================================================
	// URL scraping
	// =====================================================================
	// Per-provider HTTP timeout in ms.
	scrapeProviderTimeoutMs: z.number().int().positive(),
	// Overall budget for a single scrape request in ms (covers sequential
	// chain + parallel racers).
	scrapeOverallTimeoutMs: z.number().int().positive(),
	// Quality threshold the orchestrator uses to short-circuit the chain.
	scrapeQualityThreshold: z.number().int(),
	// How long an existing scrape row counts as "fresh" for dedup. Set to
	// zero to disable URL-based caching.
	scrapeCacheTtlHours: z.number().int().min(0),
	// Phase 4 toggles. Both default off and gate on the configured AI
	// provider being usable.
	scrapeAiProviderEnabled: z.boolean(),
	scrapeAiCleanTitlesEnabled: z.boolean(),
	// BYO custom HTTP scrapers (0:N). Each entry registers as its own
	// provider in the orchestrator chain; admin can add as many as the
	// deployment needs (one for Amazon, one for Etsy, a fallback, etc.)
	// and toggle each independently.
	//
	// Each entry's `id` is auto-generated when added and never edited;
	// `name` is the human-friendly label shown in the UI and in the
	// streaming progress alert. `endpoint` accepts the empty string so a
	// new entry can save on first add before the URL is typed.
	//
	// The orchestrator calls `${endpoint}?url=<encoded>` for each enabled
	// entry and reads the response per `responseKind` (html → goes through
	// the extractor; json → expected to match the ScrapeResult shape).
	// `customHeaders` is a multiline string with one `Header-Name: value`
	// per line; blank lines and `#`-prefixed comment lines are ignored.
	scrapeCustomHttpProviders: z
		.array(
			z.object({
				id: z.string().min(1).max(64),
				name: z.string().min(1).max(120),
				enabled: z.boolean(),
				endpoint: z.union([z.literal(''), z.url()]),
				responseKind: z.enum(['html', 'json']),
				customHeaders: z.string().max(4000).optional(),
			})
		)
		.max(16),
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
	scrapeProviderTimeoutMs: 10_000,
	scrapeOverallTimeoutMs: 20_000,
	scrapeQualityThreshold: 3,
	scrapeCacheTtlHours: 24,
	scrapeAiProviderEnabled: false,
	scrapeAiCleanTitlesEnabled: false,
	scrapeCustomHttpProviders: [],
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
