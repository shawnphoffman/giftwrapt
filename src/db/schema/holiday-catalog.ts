// Per-deploy curated holiday catalog. The source of truth for "which
// holidays exist in this deploy" - referenced by the list-creation
// dialog, list-settings form, the auto-archive cron, and the upcoming-
// holidays widget. Lists pin themselves to an entry via the implicit
// `(country, slug)` natural key (`lists.holidayCountry` +
// `lists.holidayKey`).
//
// Why a table instead of `appSettings` JSON: each entry has structured
// fields, the rule string must persist forever for any list pointing at
// the entry, and admin queries against it (per-country listings, usage
// counts) want indexes.
//
// Disabled vs deleted: disabled entries (`isEnabled = false`) stay
// queryable by date helpers so existing lists pinned to them keep
// auto-archiving and rendering correctly. Disabled entries never appear
// in the new-list pickers. Deletion is rejected when any list still
// references the row; admin sees the count and is steered to disable.
//
// Opt-in by default: every catalog row, whether seeded or admin-added,
// starts disabled. An operator must explicitly enable each holiday they
// want to surface in the new-list pickers - even for the launch
// countries. This keeps fresh deploys empty until intentionally
// curated, instead of shipping a default policy that may not match the
// deploy's user base.

import { relations } from 'drizzle-orm'
import { boolean, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { timestamps } from './shared'

export const holidayCatalog = pgTable(
	'holiday_catalog',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		// ISO 3166-1 alpha-2. Validated against the curated
		// `SUPPORTED_COUNTRIES` set at write time; not constrained at
		// the DB level so admins can later add countries the launch
		// defaults didn't include (after seeding + re-generation).
		country: text('country').notNull(),
		// URL-safe identifier. Matches `lists.holidayKey`. Stable for the
		// lifetime of the entry; renaming changes `name`, never `slug`.
		slug: text('slug').notNull(),
		// Display name shown in the new-list pickers and surfaces that
		// resolve a holiday name from `(country, key)`.
		name: text('name').notNull(),
		// Informational copy of the `date-holidays` rule string that
		// produced this entry's occurrences at generation time. The
		// runtime resolves (country, slug) against the pre-computed
		// occurrences table (src/lib/holiday-occurrences.generated.ts)
		// and never re-parses this field; it's preserved so admins
		// can see what defined each row and so the build-time generator
		// can re-resolve dates when the window is refreshed.
		rule: text('rule').notNull(),
		// Hides the entry from the new-list pickers. Existing lists
		// referencing the row continue to work (date helpers ignore the
		// flag). Defaults to false so admins must opt in to each holiday;
		// see the file header for the rationale.
		isEnabled: boolean('is_enabled').default(false).notNull(),
		...timestamps,
	},
	table => [
		uniqueIndex('holiday_catalog_country_slug_unique').on(table.country, table.slug),
		index('holiday_catalog_country_idx').on(table.country),
		index('holiday_catalog_isEnabled_idx').on(table.isEnabled),
	]
)

export const holidayCatalogRelations = relations(holidayCatalog, () => ({}))

export type HolidayCatalogEntry = typeof holidayCatalog.$inferSelect
export type NewHolidayCatalogEntry = typeof holidayCatalog.$inferInsert
