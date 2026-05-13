// Admin-curated, global "custom holidays" - the new replacement for the
// old per-(country, slug) holidayCatalog admin curation UI. Each row
// drives the date math for any list pinned to it via
// `lists.customHolidayId`, and also seeds the broadcast "pre-X reminder"
// cron family.
//
// Two flavors live in this same table, discriminated by `source`:
//
//   - source='catalog': the row points at a `(catalogCountry, catalogKey)`
//     entry in the pre-existing `holiday_catalog` table. Date math runs
//     through `nextOccurrenceBySlug`, which reads the pre-computed
//     static occurrences table. Used for holidays with non-trivial
//     recurrence (Easter, Mothering Sunday, Thanksgiving, etc.).
//
//   - source='custom': fully custom date. `customMonth` + `customDay`
//     are required; `customYear` is optional. When `customYear` is null,
//     the holiday repeats annually on (month, day). When set, it is a
//     one-time fixed date and will stop appearing in next-occurrence
//     computations after it passes.
//
// Title is the canonical display name shown in pickers and emails.
// The (small) `iconKey` is reserved for future per-holiday icon
// customization and is unused today.

import { relations } from 'drizzle-orm'
import { index, integer, pgEnum, pgTable, smallint, text, uuid } from 'drizzle-orm/pg-core'

import { timestamps } from './shared'

export const customHolidaySourceEnum = pgEnum('custom_holiday_source', ['catalog', 'custom'])

export const customHolidays = pgTable(
	'custom_holidays',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		title: text('title').notNull(),
		source: customHolidaySourceEnum('source').notNull(),
		// Populated when source='catalog'. ISO 3166-1 alpha-2 + slug
		// pointing at a row in `holiday_catalog`; the date is resolved
		// via the pre-computed occurrences table at runtime.
		catalogCountry: text('catalog_country'),
		catalogKey: text('catalog_key'),
		// Populated when source='custom'. Month 1-12, day 1-31.
		customMonth: smallint('custom_month'),
		customDay: smallint('custom_day'),
		// Optional. When null, the holiday repeats annually; when set,
		// it is a one-time fixed date.
		customYear: integer('custom_year'),
		// Reserved for future per-holiday icon override; unused today.
		iconKey: text('icon_key'),
		...timestamps,
	},
	table => [index('custom_holidays_source_idx').on(table.source)]
)

export const customHolidaysRelations = relations(customHolidays, () => ({}))

export type CustomHoliday = typeof customHolidays.$inferSelect
export type NewCustomHoliday = typeof customHolidays.$inferInsert

// Idempotency log for the broadcast pre-holiday reminder cron. One row
// per (customHoliday, occurrenceYear) marks "we've already sent the
// reminder for this holiday's occurrence." Prevents double-sends when
// the cron is invoked multiple times in the same day.
export const customHolidayReminderLogs = pgTable(
	'custom_holiday_reminder_logs',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		customHolidayId: uuid('custom_holiday_id')
			.notNull()
			.references(() => customHolidays.id, { onDelete: 'cascade' }),
		// Year of the holiday occurrence the reminder was sent FOR, not
		// the year it was sent. e.g. a reminder sent on Dec 11 2026 about
		// the Dec 25 2026 occurrence carries occurrenceYear=2026.
		occurrenceYear: integer('occurrence_year').notNull(),
		...timestamps,
	},
	table => [index('custom_holiday_reminder_logs_holiday_year_idx').on(table.customHolidayId, table.occurrenceYear)]
)

export type CustomHolidayReminderLog = typeof customHolidayReminderLogs.$inferSelect
export type NewCustomHolidayReminderLog = typeof customHolidayReminderLogs.$inferInsert
