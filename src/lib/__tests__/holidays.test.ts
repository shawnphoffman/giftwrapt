import { describe, expect, it } from 'vitest'

import {
	endOfOccurrence,
	isCountryCode,
	isValidHolidayKey,
	lastOccurrence,
	listCountries,
	listHolidaysFor,
	nextOccurrence,
	SUPPORTED_COUNTRIES,
} from '@/lib/holidays'

describe('listCountries', () => {
	it('returns the four launch countries', () => {
		const codes = listCountries().map(c => c.code)
		expect(codes).toEqual(['US', 'CA', 'GB', 'AU'])
	})
})

describe('isCountryCode', () => {
	it('accepts launch countries', () => {
		expect(isCountryCode('US')).toBe(true)
		expect(isCountryCode('CA')).toBe(true)
		expect(isCountryCode('GB')).toBe(true)
		expect(isCountryCode('AU')).toBe(true)
	})

	it('rejects unsupported codes', () => {
		expect(isCountryCode('FR')).toBe(false)
		expect(isCountryCode('us')).toBe(false)
		expect(isCountryCode('')).toBe(false)
	})
})

describe('listHolidaysFor', () => {
	it('returns sorted catalog entries for each launch country', () => {
		for (const { code } of SUPPORTED_COUNTRIES) {
			const list = listHolidaysFor(code, 2026)
			expect(list.length).toBeGreaterThan(0)
			for (let i = 1; i < list.length; i++) {
				expect(list[i].start.getTime()).toBeGreaterThanOrEqual(list[i - 1].start.getTime())
			}
		}
	})

	it('every catalog entry resolves to a real holiday in the bundled library', () => {
		// Regression guard: if a future date-holidays version changes a
		// rule string for one of our entries, the entry vanishes from
		// the output. The constant in `holidays.ts` is the contract.
		const expectedCounts = { US: 15, CA: 12, GB: 7, AU: 10 }
		for (const code of Object.keys(expectedCounts) as Array<keyof typeof expectedCounts>) {
			const list = listHolidaysFor(code, 2026)
			expect(list.length, `${code} catalog entries resolved`).toBe(expectedCounts[code])
		}
	})

	it('returns empty array for unsupported countries', () => {
		expect(listHolidaysFor('FR', 2026)).toEqual([])
		expect(listHolidaysFor('', 2026)).toEqual([])
	})

	it('Easter resolves to Apr 5 2026 in the US', () => {
		const list = listHolidaysFor('US', 2026)
		const easter = list.find(h => h.key === 'easter')
		expect(easter).toBeDefined()
		expect(easter?.start.toISOString().slice(0, 10)).toBe('2026-04-05')
	})
})

describe('isValidHolidayKey', () => {
	it('accepts known catalog entries', () => {
		expect(isValidHolidayKey('US', 'thanksgiving')).toBe(true)
		expect(isValidHolidayKey('CA', 'canada-day')).toBe(true)
		expect(isValidHolidayKey('GB', 'mothering-sunday')).toBe(true)
		expect(isValidHolidayKey('AU', 'anzac-day')).toBe(true)
	})

	it('rejects unknown keys, cross-country keys, and unsupported countries', () => {
		expect(isValidHolidayKey('US', 'mothering-sunday')).toBe(false) // GB-only slug
		expect(isValidHolidayKey('CA', 'thanksgiving')).toBe(true) // CA has its own thanksgiving
		expect(isValidHolidayKey('US', 'made-up')).toBe(false)
		expect(isValidHolidayKey('FR', 'easter')).toBe(false)
	})
})

describe('nextOccurrence', () => {
	it('returns the same-year occurrence when its end is still in the future', () => {
		// Mother's Day 2026 = May 10 (end May 11). Now = May 1, 2026.
		const result = nextOccurrence('US', 'mothers-day', new Date('2026-05-01T12:00:00Z'))
		expect(result?.toISOString().slice(0, 10)).toBe('2026-05-10')
	})

	it('rolls over to next year when the current-year occurrence has ended', () => {
		// Mother's Day 2026 ends May 11. Now = June 1, 2026 → next is May 9, 2027.
		const result = nextOccurrence('US', 'mothers-day', new Date('2026-06-01T12:00:00Z'))
		expect(result?.toISOString().slice(0, 10)).toBe('2027-05-09')
	})

	it('returns null for unknown holidays', () => {
		expect(nextOccurrence('US', 'made-up', new Date())).toBeNull()
		expect(nextOccurrence('FR', 'easter', new Date())).toBeNull()
	})
})

describe('lastOccurrence', () => {
	it('returns this year when its end has already passed', () => {
		// Easter 2026 ends Apr 6. Now = May 1, 2026.
		const result = lastOccurrence('US', 'easter', new Date('2026-05-01T12:00:00Z'))
		expect(result?.toISOString().slice(0, 10)).toBe('2026-04-05')
	})

	it('returns last year when this year has not yet ended', () => {
		// Easter 2026 ends Apr 6. Now = Mar 1, 2026 → last occurrence = 2025.
		const result = lastOccurrence('US', 'easter', new Date('2026-03-01T12:00:00Z'))
		expect(result?.toISOString().slice(0, 10)).toBe('2025-04-20')
	})

	it('returns null for unknown holidays', () => {
		expect(lastOccurrence('US', 'made-up', new Date())).toBeNull()
	})
})

describe('endOfOccurrence', () => {
	it("returns the holiday's end date for a known year", () => {
		const start = new Date('2026-04-05T00:00:00Z') // Easter Sunday 2026
		const end = endOfOccurrence('US', 'easter', start)
		// The library returns end = start + 1 day for single-day holidays.
		expect(end?.toISOString().slice(0, 10)).toBe('2026-04-06')
	})

	it('returns null for unknown holidays', () => {
		expect(endOfOccurrence('US', 'made-up', new Date('2026-04-05'))).toBeNull()
	})
})
