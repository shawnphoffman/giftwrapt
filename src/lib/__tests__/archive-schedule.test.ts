import { describe, expect, it } from 'vitest'

import type { ArchiveDaysSettings, ArchiveScheduleInput } from '@/lib/archive-schedule'
import { computeArchiveSchedule, maxDeferDate } from '@/lib/archive-schedule'

const SETTINGS: ArchiveDaysSettings = {
	archiveDaysAfterBirthday: 14,
	archiveDaysAfterChristmas: 14,
	archiveDaysAfterHoliday: 14,
}

function baseInput(overrides: Partial<ArchiveScheduleInput> = {}): ArchiveScheduleInput {
	return {
		type: 'birthday',
		isActive: true,
		subjectDependentId: null,
		archiveDeferUntil: null,
		lastArchivedAt: null,
		customHolidayId: null,
		customHoliday: null,
		ownerBirthMonth: 'june',
		ownerBirthDay: 15,
		...overrides,
	}
}

const DAY = 86_400_000

describe('computeArchiveSchedule - applicability', () => {
	it('does not apply to giftideas lists', async () => {
		const s = await computeArchiveSchedule(baseInput({ type: 'giftideas' }), SETTINGS, new Date('2026-06-09T12:00:00'))
		expect(s.applies).toBe(false)
	})

	it('does not apply to inactive lists', async () => {
		const s = await computeArchiveSchedule(baseInput({ isActive: false }), SETTINGS, new Date('2026-06-09T12:00:00'))
		expect(s.applies).toBe(false)
	})

	it('does not apply to dependent-subject lists', async () => {
		const s = await computeArchiveSchedule(baseInput({ subjectDependentId: 'dep_1' }), SETTINGS, new Date('2026-06-09T12:00:00'))
		expect(s.applies).toBe(false)
	})

	it('does not apply to a holiday list with no holiday selected', async () => {
		const s = await computeArchiveSchedule(baseInput({ type: 'holiday', customHolidayId: null }), SETTINGS, new Date('2026-06-09T12:00:00'))
		expect(s.applies).toBe(false)
	})

	it('does not apply to a birthday/wishlist whose owner has no birthday', async () => {
		const s = await computeArchiveSchedule(
			baseInput({ ownerBirthMonth: null, ownerBirthDay: null }),
			SETTINGS,
			new Date('2026-06-09T12:00:00')
		)
		expect(s.applies).toBe(false)
	})
})

describe('computeArchiveSchedule - birthday cycle', () => {
	it('before the birthday: shows this year birthday + 14, event not passed', async () => {
		const now = new Date(2026, 5, 1, 12) // Jun 1 2026, before Jun 15
		const s = await computeArchiveSchedule(baseInput(), SETTINGS, now)
		expect(s.applies).toBe(true)
		expect(s.eventDate).toEqual(new Date(2026, 5, 15))
		expect(s.defaultArchiveDate).toEqual(new Date(2026, 5, 29))
		expect(s.effectiveArchiveDate).toEqual(new Date(2026, 5, 29))
		expect(s.eventHasPassed).toBe(false)
		expect(s.inForceWindow).toBe(false)
	})

	it('in the gap (event passed, before archive): force window open', async () => {
		const now = new Date(2026, 5, 20, 12) // Jun 20, between Jun 15 and Jun 29
		const s = await computeArchiveSchedule(baseInput(), SETTINGS, now)
		expect(s.eventDate).toEqual(new Date(2026, 5, 15))
		expect(s.eventHasPassed).toBe(true)
		expect(s.inForceWindow).toBe(true)
		expect(s.deferUntil).toBeNull()
	})

	it('after the archive date: rolls to next year, no force window', async () => {
		const now = new Date(2026, 6, 5, 12) // Jul 5, after Jun 29
		const s = await computeArchiveSchedule(baseInput(), SETTINGS, now)
		expect(s.eventDate).toEqual(new Date(2027, 5, 15))
		expect(s.eventHasPassed).toBe(false)
		expect(s.inForceWindow).toBe(false)
	})
})

describe('computeArchiveSchedule - defer behavior', () => {
	it('active defer extends the effective archive date and suppresses force window', async () => {
		const now = new Date(2026, 5, 20, 12) // in the gap
		const defer = new Date(2026, 6, 20) // Jul 20, past default Jun 29
		const s = await computeArchiveSchedule(baseInput({ archiveDeferUntil: defer }), SETTINGS, now)
		expect(s.effectiveArchiveDate).toEqual(defer)
		expect(s.defaultArchiveDate).toEqual(new Date(2026, 5, 29))
		expect(s.deferUntil).toEqual(defer)
		expect(s.eventHasPassed).toBe(true)
		expect(s.inForceWindow).toBe(false)
	})

	it('a defer keeps the open cycle open past the default archive date', async () => {
		const now = new Date(2026, 6, 5, 12) // Jul 5, past default but before defer
		const defer = new Date(2026, 6, 20)
		const s = await computeArchiveSchedule(baseInput({ archiveDeferUntil: defer }), SETTINGS, now)
		// Still the 2026 cycle, not rolled to 2027.
		expect(s.eventDate).toEqual(new Date(2026, 5, 15))
		expect(s.effectiveArchiveDate).toEqual(defer)
	})

	it('an expired defer (in the past) is not treated as active', async () => {
		const now = new Date(2026, 5, 20, 12)
		const defer = new Date(2026, 5, 10) // already passed
		const s = await computeArchiveSchedule(baseInput({ archiveDeferUntil: defer }), SETTINGS, now)
		// effective archive is the (past) defer, so the cycle is closed -> next year.
		expect(s.eventDate).toEqual(new Date(2027, 5, 15))
		expect(s.deferUntil).toBeNull()
	})
})

describe('computeArchiveSchedule - christmas cycle', () => {
	it('mid-December before the 25th: event upcoming', async () => {
		const now = new Date(2026, 11, 10, 12)
		const s = await computeArchiveSchedule(baseInput({ type: 'christmas' }), SETTINGS, now)
		expect(s.eventDate).toEqual(new Date(2026, 11, 25))
		expect(s.defaultArchiveDate).toEqual(new Date(2027, 0, 8))
		expect(s.eventHasPassed).toBe(false)
	})

	it('Dec 28: in the gap, force window open', async () => {
		const now = new Date(2026, 11, 28, 12)
		const s = await computeArchiveSchedule(baseInput({ type: 'christmas' }), SETTINGS, now)
		expect(s.eventDate).toEqual(new Date(2026, 11, 25))
		expect(s.inForceWindow).toBe(true)
	})
})

describe('maxDeferDate', () => {
	it('caps at event + maxDeferDays', () => {
		const event = new Date(2026, 5, 15)
		expect(maxDeferDate(event, 90)).toEqual(new Date(event.getTime() + 90 * DAY))
	})

	it('returns null without an event date', () => {
		expect(maxDeferDate(null, 90)).toBeNull()
	})
})
