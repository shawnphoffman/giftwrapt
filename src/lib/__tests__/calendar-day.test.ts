import { describe, expect, it } from 'vitest'

import { addCalendarDays, calendarDayInZone, isValidTimeZone } from '@/lib/calendar-day'

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d))

describe('calendarDayInZone', () => {
	// Dec 25, 6 PM in Los Angeles; Dec 26, 3 AM in Tokyo.
	const instant = new Date('2026-12-26T02:00:00Z')

	it('returns UTC midnight of the date in the given zone', () => {
		expect(calendarDayInZone(instant, 'America/Los_Angeles')).toEqual(utc(2026, 11, 25))
		expect(calendarDayInZone(instant, 'Asia/Tokyo')).toEqual(utc(2026, 11, 26))
		expect(calendarDayInZone(instant, 'UTC')).toEqual(utc(2026, 11, 26))
	})

	it('falls back to UTC for a missing or unknown zone', () => {
		expect(calendarDayInZone(instant, undefined)).toEqual(utc(2026, 11, 26))
		expect(calendarDayInZone(instant, '')).toEqual(utc(2026, 11, 26))
		expect(calendarDayInZone(instant, 'Mars/Olympus_Mons')).toEqual(utc(2026, 11, 26))
	})

	it('handles a year boundary', () => {
		expect(calendarDayInZone(new Date('2027-01-01T04:30:00Z'), 'America/New_York')).toEqual(utc(2026, 11, 31))
	})

	it('tracks daylight saving (LA is UTC-7 in summer, UTC-8 in winter)', () => {
		expect(calendarDayInZone(new Date('2026-07-01T06:30:00Z'), 'America/Los_Angeles')).toEqual(utc(2026, 5, 30))
		expect(calendarDayInZone(new Date('2026-07-01T07:30:00Z'), 'America/Los_Angeles')).toEqual(utc(2026, 6, 1))
		expect(calendarDayInZone(new Date('2026-01-01T07:30:00Z'), 'America/Los_Angeles')).toEqual(utc(2025, 11, 31))
	})
})

describe('isValidTimeZone', () => {
	it('accepts IANA names and rejects anything else', () => {
		expect(isValidTimeZone('UTC')).toBe(true)
		expect(isValidTimeZone('America/Los_Angeles')).toBe(true)
		expect(isValidTimeZone('')).toBe(false)
		expect(isValidTimeZone('Not/AZone')).toBe(false)
	})
})

describe('addCalendarDays', () => {
	it('moves across months and years', () => {
		expect(addCalendarDays(utc(2026, 11, 25), 14)).toEqual(utc(2027, 0, 8))
		expect(addCalendarDays(utc(2026, 2, 1), -1)).toEqual(utc(2026, 1, 28))
	})
})
