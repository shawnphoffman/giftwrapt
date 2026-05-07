import { describe, expect, it } from 'vitest'

import {
	endOfOccurrenceForRule,
	isCountryCode,
	lastOccurrenceForRule,
	nextOccurrenceForRule,
	resolveOccurrenceForRule,
	SUPPORTED_COUNTRIES,
} from '@/lib/holidays'

describe('SUPPORTED_COUNTRIES', () => {
	it('lists the launch countries', () => {
		const codes = SUPPORTED_COUNTRIES.map(c => c.code)
		expect(codes).toEqual(['US', 'CA', 'GB', 'AU'])
	})
})

describe('isCountryCode', () => {
	it('accepts countries the bundled date-holidays library knows about', () => {
		expect(isCountryCode('US')).toBe(true)
		expect(isCountryCode('CA')).toBe(true)
		expect(isCountryCode('GB')).toBe(true)
		expect(isCountryCode('AU')).toBe(true)
		expect(isCountryCode('FR')).toBe(true)
	})

	it('rejects malformed codes', () => {
		expect(isCountryCode('us')).toBe(false)
		expect(isCountryCode('')).toBe(false)
		expect(isCountryCode('ZZ')).toBe(false)
	})
})

describe('resolveOccurrenceForRule', () => {
	it('resolves the start and end of a known holiday rule', () => {
		const result = resolveOccurrenceForRule('US', 'easter', 2026)
		expect(result?.start.toISOString().slice(0, 10)).toBe('2026-04-05')
		// The library returns end = start + 1 day for single-day holidays.
		expect(result?.end.toISOString().slice(0, 10)).toBe('2026-04-06')
	})

	it('returns null for an unknown rule or unsupported country', () => {
		expect(resolveOccurrenceForRule('US', 'made-up', 2026)).toBeNull()
		expect(resolveOccurrenceForRule('ZZ', 'easter', 2026)).toBeNull()
	})
})

describe('nextOccurrenceForRule', () => {
	it('returns the same-year occurrence when its end is still in the future', () => {
		// Mother's Day 2026 = May 10 (end May 11). Now = May 1, 2026.
		const result = nextOccurrenceForRule('US', '2nd sunday in May', new Date('2026-05-01T12:00:00Z'))
		expect(result?.toISOString().slice(0, 10)).toBe('2026-05-10')
	})

	it('rolls over to next year when the current-year occurrence has ended', () => {
		const result = nextOccurrenceForRule('US', '2nd sunday in May', new Date('2026-06-01T12:00:00Z'))
		expect(result?.toISOString().slice(0, 10)).toBe('2027-05-09')
	})

	it('returns null for unknown rules', () => {
		expect(nextOccurrenceForRule('US', 'made-up', new Date())).toBeNull()
	})
})

describe('lastOccurrenceForRule', () => {
	it('returns this year when its end has already passed', () => {
		const result = lastOccurrenceForRule('US', 'easter', new Date('2026-05-01T12:00:00Z'))
		expect(result?.toISOString().slice(0, 10)).toBe('2026-04-05')
	})

	it('returns last year when this year has not yet ended', () => {
		const result = lastOccurrenceForRule('US', 'easter', new Date('2026-03-01T12:00:00Z'))
		expect(result?.toISOString().slice(0, 10)).toBe('2025-04-20')
	})

	it('returns null for unknown rules', () => {
		expect(lastOccurrenceForRule('US', 'made-up', new Date())).toBeNull()
	})
})

describe('endOfOccurrenceForRule', () => {
	it("returns the holiday's end date for a known year", () => {
		const start = new Date('2026-04-05T00:00:00Z')
		const end = endOfOccurrenceForRule('US', 'easter', start)
		expect(end?.toISOString().slice(0, 10)).toBe('2026-04-06')
	})

	it('returns null for unknown rules', () => {
		expect(endOfOccurrenceForRule('US', 'made-up', new Date('2026-04-05'))).toBeNull()
	})
})
