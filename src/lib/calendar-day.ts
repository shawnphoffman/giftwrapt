// Calendar-day helpers for the deployment time zone.
//
// Birthdays, holidays, and archive dates are calendar dates, not
// instants. The server represents a calendar date as UTC midnight of that
// date (`2026-12-25T00:00:00Z` is Dec 25) and compares with UTC getters.
// What varies is "which date is it right now?": that depends on a time
// zone. `calendarDayInZone` answers it for the deployment's configured
// zone (`appSettings.timeZone`), so every scheduled job and server-side
// date check agrees on when a day starts.
//
// Client-safe: pure Intl, no server imports.

const DAY_MS = 86_400_000

export const DEFAULT_TIME_ZONE = 'UTC'

// True when `timeZone` is an IANA zone name the runtime understands.
export function isValidTimeZone(timeZone: string): boolean {
	if (!timeZone) return false
	try {
		new Intl.DateTimeFormat('en-US', { timeZone })
		return true
	} catch {
		return false
	}
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
	let f = formatterCache.get(timeZone)
	if (!f) {
		f = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' })
		formatterCache.set(timeZone, f)
	}
	return f
}

// The calendar date `now` falls on in `timeZone`, as UTC midnight of that
// date. An invalid or empty zone falls back to UTC rather than throwing,
// so a bad setting can't take a cron down.
export function calendarDayInZone(now: Date, timeZone: string | undefined): Date {
	const zone = timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE
	const parts = formatterFor(zone).formatToParts(now)
	const get = (type: 'year' | 'month' | 'day') => Number(parts.find(p => p.type === type)?.value)
	return new Date(Date.UTC(get('year'), get('month') - 1, get('day')))
}

// Adds whole calendar days to a UTC-midnight calendar date.
export function addCalendarDays(day: Date, n: number): Date {
	return new Date(day.getTime() + n * DAY_MS)
}
