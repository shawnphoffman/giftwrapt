import { describe, expect, it } from 'vitest'

import { HOLIDAY_CATALOG_SEED } from '@/db/holiday-catalog-seed'
import { HOLIDAY_OCCURRENCES, HOLIDAY_OCCURRENCES_FIRST_YEAR, HOLIDAY_OCCURRENCES_LAST_YEAR } from '@/lib/holiday-occurrences.generated'

// Forces a re-run of `pnpm holidays:generate` whenever the table
// covers fewer than this many years into the future. CI fails when
// the file goes stale so reminders / auto-archive / pickers never
// silently start returning null for next year.
const MIN_FUTURE_YEARS = 3

describe('holiday-occurrences.generated', () => {
	it('covers at least MIN_FUTURE_YEARS years past today', () => {
		const currentYear = new Date().getUTCFullYear()
		const requiredEnd = currentYear + MIN_FUTURE_YEARS
		expect(HOLIDAY_OCCURRENCES_LAST_YEAR).toBeGreaterThanOrEqual(requiredEnd)
	})

	it('covers at least the previous calendar year', () => {
		const currentYear = new Date().getUTCFullYear()
		expect(HOLIDAY_OCCURRENCES_FIRST_YEAR).toBeLessThanOrEqual(currentYear - 1)
	})

	it('has one entry per seed row', () => {
		const seedKeys = new Set(HOLIDAY_CATALOG_SEED.map(s => `${s.country}/${s.slug}`))
		const generatedKeys = new Set(HOLIDAY_OCCURRENCES.map(e => `${e.country}/${e.slug}`))
		expect(generatedKeys).toEqual(seedKeys)
	})

	it('every entry has at least one resolved occurrence', () => {
		for (const entry of HOLIDAY_OCCURRENCES) {
			expect(Object.keys(entry.occurrences).length).toBeGreaterThan(0)
		}
	})
})
