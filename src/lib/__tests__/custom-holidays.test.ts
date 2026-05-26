import { describe, expect, it } from 'vitest'

import type { CustomHolidayRow } from '@/lib/custom-holidays'
import { customHolidayDisplayDate, customHolidayNextOccurrence } from '@/lib/custom-holidays'

// Minimal builder for source='custom' rows. The catalog branch is
// covered by integration tests where a real holiday_catalog row exists.
function customRow(
	input: Partial<CustomHolidayRow> & { customMonth: number; customDay: number; customYear?: number | null }
): CustomHolidayRow {
	return {
		id: input.id ?? '00000000-0000-0000-0000-000000000000',
		title: input.title ?? 'Test Holiday',
		source: 'custom',
		catalogCountry: null,
		catalogKey: null,
		customMonth: input.customMonth,
		customDay: input.customDay,
		customYear: input.customYear ?? null,
		recipientUserId: null,
		recipientDependentId: null,
		iconKey: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	} as CustomHolidayRow
}

describe('customHolidayNextOccurrence (source=custom)', () => {
	it('annual: returns this-year date when still upcoming', async () => {
		const row = customRow({ customMonth: 7, customDay: 4 })
		const result = await customHolidayNextOccurrence(row, new Date('2026-05-01T12:00:00Z'))
		expect(result?.toISOString().slice(0, 10)).toBe('2026-07-04')
	})

	it('annual: rolls to next year when this year already passed', async () => {
		const row = customRow({ customMonth: 7, customDay: 4 })
		const result = await customHolidayNextOccurrence(row, new Date('2026-08-01T12:00:00Z'))
		expect(result?.toISOString().slice(0, 10)).toBe('2027-07-04')
	})

	it('one-time: returns the date when still upcoming', async () => {
		const row = customRow({ customMonth: 6, customDay: 20, customYear: 2026 })
		const result = await customHolidayNextOccurrence(row, new Date('2026-05-01T12:00:00Z'))
		expect(result?.toISOString().slice(0, 10)).toBe('2026-06-20')
	})

	it('one-time: returns null after the date has passed', async () => {
		const row = customRow({ customMonth: 6, customDay: 20, customYear: 2025 })
		const result = await customHolidayNextOccurrence(row, new Date('2026-05-01T12:00:00Z'))
		expect(result).toBeNull()
	})
})

describe('customHolidayDisplayDate', () => {
	it('mirrors next-occurrence when an upcoming date exists', async () => {
		const row = customRow({ customMonth: 7, customDay: 4 })
		const result = await customHolidayDisplayDate(row, new Date('2026-05-01T12:00:00Z'))
		expect(result?.toISOString().slice(0, 10)).toBe('2026-07-04')
	})

	it('one-time past holiday: falls back to the stored date so the UI can render "passed"', async () => {
		const row = customRow({ customMonth: 6, customDay: 20, customYear: 2025 })
		const result = await customHolidayDisplayDate(row, new Date('2026-05-01T12:00:00Z'))
		expect(result?.toISOString().slice(0, 10)).toBe('2025-06-20')
	})

	it('annual rows never produce a past fallback (they always roll forward)', async () => {
		const row = customRow({ customMonth: 1, customDay: 1 })
		const result = await customHolidayDisplayDate(row, new Date('2026-06-15T12:00:00Z'))
		// Rolled to next year, never the past.
		expect(result?.toISOString().slice(0, 10)).toBe('2027-01-01')
	})
})
