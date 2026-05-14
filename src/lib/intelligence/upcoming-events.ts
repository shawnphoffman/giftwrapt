// Per-subject "what's coming up that drives auto-archive?" helper. Shared
// by:
//   - the list-hygiene analyzer (deciding whether a subject's lists are
//     shaped right for the next event in window);
//   - the edit-list dialog (rendering calendar-proximity warnings when
//     the owner is about to change a list's type / customHolidayId /
//     active state);
//   - the primary-list analyzer's yield clause (yielding to list-hygiene
//     when a calendar-aware rec would cover the same nudge).
//
// "In window" means: at least `intelligenceMinDaysBeforeEventForRecs`
// days away AND at most `intelligenceUpcomingWindowDays` days away.
// Defaults 1 and 45. Events outside the window are excluded.
//
// The event set is the auto-archive-driving set: birthday, christmas,
// and per-custom-holiday. Anniversary, Mother's / Father's / Valentine's
// Day are intentionally excluded; auto-archive doesn't key off them and
// list shape doesn't matter for them.
//
// The pure types + `eventIsCovered` live in `upcoming-events-types.ts`
// so the list-change-impact helper (imported by the edit-list dialog)
// can use them without dragging `db`/`pg` into the client bundle. This
// file is server-only.

import { eq } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { customHolidays, dependents, users } from '@/db/schema'
import { birthMonthEnumValues, type ListType } from '@/db/schema/enums'
import { customHolidayNextOccurrence, startOfUtcDay } from '@/lib/custom-holidays'
import type { AppSettings } from '@/lib/settings'

import type { InWindowEvent } from './upcoming-events-types'

export { eventIsCovered, type InWindowEvent } from './upcoming-events-types'

export type GetInWindowEventsArgs = {
	userId: string
	// Null for user-subject runs; dependent id for dependent-subject runs.
	// Birthday is sourced from `dependents.birthMonth/Day` for dependent
	// runs and `users.birthMonth/Day` for user runs. Christmas and
	// custom-holiday events apply equally to both.
	dependentId: string | null
	settings: AppSettings
	now?: Date
	// Database / transaction handle. Required — keeping a `db` default
	// here would force a top-level `import { db }` that drags `pg` into
	// the client bundle when callers import the analyzer module.
	dbx: SchemaDatabase
}

// 1-based month index (jan=1, dec=12). Returns null when the column is
// not set or doesn't match the enum (defensive — types guarantee the
// match in practice).
function birthMonthIndex(month: string | null): number | null {
	if (!month) return null
	const idx = birthMonthEnumValues.indexOf(month as (typeof birthMonthEnumValues)[number])
	if (idx < 0) return null
	return idx + 1
}

// Resolves the next occurrence (>= today UTC) of a fixed (month, day),
// rolling forward to next year when the date has already passed. Mirrors
// the helper in _widgets-impl.ts; duplicated here only so this file can
// be imported from analyzers without dragging the widget impl with it.
function nextAnnualDate(month: number, day: number, now: Date): Date {
	const thisYear = now.getUTCFullYear()
	const todayMs = startOfUtcDay(now).getTime()
	const candidate = new Date(Date.UTC(thisYear, month - 1, day))
	if (candidate.getTime() >= todayMs) return candidate
	return new Date(Date.UTC(thisYear + 1, month - 1, day))
}

function utcDayMs(d: Date): number {
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

const BIRTHDAY_MATCH_TYPES: ReadonlyArray<ListType> = ['birthday', 'wishlist']
const CHRISTMAS_MATCH_TYPES: ReadonlyArray<ListType> = ['christmas']
const CUSTOM_HOLIDAY_MATCH_TYPES: ReadonlyArray<ListType> = ['holiday']

export async function getInWindowEventsForSubject(args: GetInWindowEventsArgs): Promise<Array<InWindowEvent>> {
	const { userId, dependentId, settings, now = new Date(), dbx } = args
	const windowDays = settings.intelligenceUpcomingWindowDays
	const minDays = settings.intelligenceMinDaysBeforeEventForRecs
	if (windowDays < minDays) return []

	const todayUtcMs = utcDayMs(now)
	const candidates: Array<InWindowEvent> = []

	// === Birthday ===
	// Source depends on subject. Match types {birthday, wishlist} mirrors
	// the auto-archive birthday branch in src/lib/cron/auto-archive.ts.
	if (settings.enableBirthdayLists) {
		let bMonth: number | null = null
		let bDay: number | null = null
		if (dependentId === null) {
			const me = await dbx.query.users.findFirst({
				where: eq(users.id, userId),
				columns: { birthMonth: true, birthDay: true },
			})
			bMonth = birthMonthIndex(me?.birthMonth ?? null)
			bDay = me?.birthDay ?? null
		} else {
			const dep = await dbx.query.dependents.findFirst({
				where: eq(dependents.id, dependentId),
				columns: { birthMonth: true, birthDay: true },
			})
			bMonth = birthMonthIndex(dep?.birthMonth ?? null)
			bDay = dep?.birthDay ?? null
		}
		if (bMonth != null && bDay != null) {
			const occurrence = nextAnnualDate(bMonth, bDay, now)
			const daysUntil = Math.round((utcDayMs(occurrence) - todayUtcMs) / 86_400_000)
			if (daysUntil >= minDays && daysUntil <= windowDays) {
				candidates.push({
					kind: 'birthday',
					matchTypes: BIRTHDAY_MATCH_TYPES,
					occurrence,
					occurrenceISO: occurrence.toISOString(),
					daysUntil,
					eventTitle: 'Birthday',
				})
			}
		}
	}

	// === Christmas (Dec 25) ===
	// Tenant-gated; applies to user and dependent subjects equally since
	// auto-archive's christmas branch targets all active christmas-typed
	// lists regardless of subject.
	if (settings.enableChristmasLists) {
		const occurrence = nextAnnualDate(12, 25, now)
		const daysUntil = Math.round((utcDayMs(occurrence) - todayUtcMs) / 86_400_000)
		if (daysUntil >= minDays && daysUntil <= windowDays) {
			candidates.push({
				kind: 'christmas',
				matchTypes: CHRISTMAS_MATCH_TYPES,
				occurrence,
				occurrenceISO: occurrence.toISOString(),
				daysUntil,
				eventTitle: 'Christmas',
			})
		}
	}

	// === Custom holidays ===
	// Every active row is a candidate; gated by the tenant generic-holiday
	// toggle. Per-(custom-holiday, occurrence) — a holiday-typed list
	// auto-archives only when its `customHolidayId` matches.
	if (settings.enableGenericHolidayLists) {
		const rows = await dbx.select().from(customHolidays)
		for (const row of rows) {
			const occurrence = await customHolidayNextOccurrence(row, now, dbx)
			if (!occurrence) continue
			const daysUntil = Math.round((utcDayMs(occurrence) - todayUtcMs) / 86_400_000)
			if (daysUntil < minDays || daysUntil > windowDays) continue
			candidates.push({
				kind: 'custom-holiday',
				matchTypes: CUSTOM_HOLIDAY_MATCH_TYPES,
				customHolidayId: row.id,
				occurrence,
				occurrenceISO: occurrence.toISOString(),
				daysUntil,
				eventTitle: row.title,
			})
		}
	}

	// Sort ascending by occurrence. Stable tiebreaker on title for
	// deterministic test output.
	candidates.sort((a, b) => {
		const aMs = utcDayMs(a.occurrence)
		const bMs = utcDayMs(b.occurrence)
		if (aMs !== bMs) return aMs - bMs
		return a.eventTitle.localeCompare(b.eventTitle)
	})
	return candidates
}
