// Helpers for the admin-curated `custom_holidays` table.
//
// Two flavors of row, discriminated by `source`:
//
//   - source='catalog': resolves via the pre-existing
//     `holiday_catalog` (country, slug) lookup against the static
//     pre-computed occurrence table.
//
//   - source='custom': uses the stored (month, day, year?) directly.
//     `year=null` means "repeats annually"; the next occurrence rolls
//     forward to the next future calendar year. A non-null year is a
//     one-time fixed date; `nextOccurrence` returns null once it passes.
//
// All resolvers are calendar-day precise (no timezone math); the cron
// passes a UTC Date and the helpers compare against UTC year/month/day.

import { and, eq } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { db } from '@/db'
import { customHolidays, holidayCatalog } from '@/db/schema'
import { nextOccurrenceBySlug } from '@/lib/holidays'

export type CustomHolidayRow = typeof customHolidays.$inferSelect

export async function getCustomHoliday(id: string, dbx: SchemaDatabase = db): Promise<CustomHolidayRow | null> {
	const row = await dbx.query.customHolidays.findFirst({ where: eq(customHolidays.id, id) })
	return row ?? null
}

// Compute the next future occurrence (>= now) for a custom holiday row.
// Returns null if:
//   - source='catalog' but the catalog entry is missing / the rule no
//     longer resolves (e.g. a library upgrade dropped the holiday);
//   - source='custom' with a one-time date that has already passed.
export async function customHolidayNextOccurrence(
	row: CustomHolidayRow,
	now: Date = new Date(),
	dbx: SchemaDatabase = db
): Promise<Date | null> {
	if (row.source === 'catalog') {
		if (!row.catalogCountry || !row.catalogKey) return null
		const entry = await dbx.query.holidayCatalog.findFirst({
			where: and(eq(holidayCatalog.country, row.catalogCountry), eq(holidayCatalog.slug, row.catalogKey)),
			columns: { country: true, slug: true },
		})
		if (!entry) return null
		return nextOccurrenceBySlug(entry.country, entry.slug, now)
	}

	// source='custom'
	if (row.customMonth == null || row.customDay == null) return null
	const m = row.customMonth // 1-12
	const d = row.customDay // 1-31

	if (row.customYear != null) {
		// One-time fixed date.
		const candidate = new Date(Date.UTC(row.customYear, m - 1, d, 0, 0, 0, 0))
		if (candidate.getTime() < startOfUtcDay(now).getTime()) return null
		return candidate
	}

	// Annual recurrence. Try this year first; if it's already past, roll
	// to next year.
	const thisYear = now.getUTCFullYear()
	const todayUtc = startOfUtcDay(now)
	const candidateThisYear = new Date(Date.UTC(thisYear, m - 1, d, 0, 0, 0, 0))
	if (candidateThisYear.getTime() >= todayUtc.getTime()) return candidateThisYear
	return new Date(Date.UTC(thisYear + 1, m - 1, d, 0, 0, 0, 0))
}

export function startOfUtcDay(d: Date): Date {
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0))
}

export function isSameUtcDay(a: Date, b: Date): boolean {
	return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate()
}
