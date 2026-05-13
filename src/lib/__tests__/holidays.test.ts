import { describe, expect, it } from 'vitest'

import {
	endOfOccurrenceBySlug,
	isCountryCode,
	lastOccurrenceBySlug,
	nextOccurrenceBySlug,
	resolveOccurrence,
	SUPPORTED_COUNTRIES,
} from '@/lib/holidays'

describe('SUPPORTED_COUNTRIES', () => {
	it('starts with the original launch set in fixed order', () => {
		const codes = SUPPORTED_COUNTRIES.slice(0, 4).map(c => c.code)
		expect(codes).toEqual(['US', 'CA', 'GB', 'AU'])
	})

	it('sorts the remaining countries alphabetically by name', () => {
		const rest = SUPPORTED_COUNTRIES.slice(4)
		const names = rest.map(c => c.name)
		expect(names).toEqual([...names].sort())
	})
})

describe('isCountryCode', () => {
	it('accepts countries present in the curated supported set', () => {
		expect(isCountryCode('US')).toBe(true)
		expect(isCountryCode('CA')).toBe(true)
		expect(isCountryCode('GB')).toBe(true)
		expect(isCountryCode('AU')).toBe(true)
		expect(isCountryCode('FR')).toBe(true)
		expect(isCountryCode('JP')).toBe(true)
	})

	it('rejects malformed codes', () => {
		expect(isCountryCode('us')).toBe(false)
		expect(isCountryCode('')).toBe(false)
		expect(isCountryCode('ZZ')).toBe(false)
	})

	it('rejects countries we dropped from the curated set', () => {
		// AT/BE/CH/DK/FI/NO/ZA were in the launch list but trimmed.
		expect(isCountryCode('AT')).toBe(false)
		expect(isCountryCode('ZA')).toBe(false)
	})
})

describe('resolveOccurrence', () => {
	it('returns start and end for a known slug + year', () => {
		const result = resolveOccurrence('US', 'easter', 2026)
		expect(result).not.toBeNull()
		expect(result?.start.toISOString().slice(0, 10)).toBe('2026-04-05')
		expect(result?.end.toISOString().slice(0, 10)).toBe('2026-04-06')
	})

	it('returns null for unknown slugs and unknown countries', () => {
		expect(resolveOccurrence('US', 'made-up', 2026)).toBeNull()
		expect(resolveOccurrence('ZZ', 'easter', 2026)).toBeNull()
	})
})

describe('nextOccurrenceBySlug', () => {
	it('returns this-year start when now is before it', () => {
		const result = nextOccurrenceBySlug('US', 'mothers-day', new Date('2026-05-01T12:00:00Z'))
		expect(result).not.toBeNull()
		expect(result?.toISOString().slice(0, 10)).toBe('2026-05-10')
	})

	it('rolls to next year when this year already passed', () => {
		const result = nextOccurrenceBySlug('US', 'mothers-day', new Date('2026-06-01T12:00:00Z'))
		expect(result).not.toBeNull()
		expect(result?.toISOString().slice(0, 10)).toBe('2027-05-09')
	})

	it('returns null for unknown slugs', () => {
		expect(nextOccurrenceBySlug('US', 'made-up', new Date())).toBeNull()
	})
})

describe('lastOccurrenceBySlug', () => {
	it('returns this-year start when now is after it', () => {
		const result = lastOccurrenceBySlug('US', 'easter', new Date('2026-05-01T12:00:00Z'))
		expect(result).not.toBeNull()
		expect(result?.toISOString().slice(0, 10)).toBe('2026-04-05')
	})

	it('returns last year when this year has not happened yet', () => {
		const result = lastOccurrenceBySlug('US', 'easter', new Date('2026-03-01T12:00:00Z'))
		expect(result).not.toBeNull()
		expect(result?.toISOString().slice(0, 10)).toBe('2025-04-20')
	})

	it('returns null for unknown slugs', () => {
		expect(lastOccurrenceBySlug('US', 'made-up', new Date())).toBeNull()
	})
})

describe('endOfOccurrenceBySlug', () => {
	it('returns end-of-occurrence for the given start year', () => {
		const start = new Date('2026-04-05T00:00:00Z')
		const end = endOfOccurrenceBySlug('US', 'easter', start)
		expect(end).not.toBeNull()
		expect(end?.toISOString().slice(0, 10)).toBe('2026-04-06')
	})

	it('returns null for unknown slugs', () => {
		expect(endOfOccurrenceBySlug('US', 'made-up', new Date('2026-04-05'))).toBeNull()
	})
})
