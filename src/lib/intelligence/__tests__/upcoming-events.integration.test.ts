// Coverage for the per-subject "what events drive auto-archive in the
// near future?" helper. Asserts the window math, the dependent vs user
// branch, the tenant gates, and the custom-holiday source.

import { makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { customHolidays, dependentGuardianships, dependents } from '@/db/schema'
import { DEFAULT_APP_SETTINGS } from '@/lib/settings'

import { eventIsCovered, getInWindowEventsForSubject, type InWindowEvent } from '../upcoming-events'

// Fixed clock for deterministic event math. Late May so birthday on
// June 5 lands 14 days out — comfortably inside the default 45-day
// window, comfortably above the 1-day floor.
const NOW = new Date('2026-05-22T12:00:00Z')

describe('getInWindowEventsForSubject', () => {
	it('emits a birthday event when the user birth fields land inside the window', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx, { birthMonth: 'june', birthDay: 5 })
			const events = await getInWindowEventsForSubject({
				userId: user.id,
				dependentId: null,
				settings: DEFAULT_APP_SETTINGS,
				now: NOW,
				dbx: tx,
			})
			const birthday = events.find(e => e.kind === 'birthday')
			expect(birthday).toBeDefined()
			expect(birthday?.daysUntil).toBe(14)
			expect(birthday?.matchTypes).toEqual(['birthday', 'wishlist'])
		})
	})

	it('skips birthday when the user has no birth month/day set', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx, { birthMonth: null, birthDay: null })
			const events = await getInWindowEventsForSubject({
				userId: user.id,
				dependentId: null,
				settings: DEFAULT_APP_SETTINGS,
				now: NOW,
				dbx: tx,
			})
			expect(events.find(e => e.kind === 'birthday')).toBeUndefined()
		})
	})

	it('skips birthday when the birthday is past the window (e.g. 200 days out)', async () => {
		await withRollback(async tx => {
			// May 22 NOW -> birthday Dec 31 is ~223 days out, outside 45.
			const user = await makeUser(tx, { birthMonth: 'december', birthDay: 31 })
			const events = await getInWindowEventsForSubject({
				userId: user.id,
				dependentId: null,
				settings: DEFAULT_APP_SETTINGS,
				now: NOW,
				dbx: tx,
			})
			expect(events.find(e => e.kind === 'birthday')).toBeUndefined()
		})
	})

	it('skips birthday on the day-of when min-days floor is 1', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx, { birthMonth: 'may', birthDay: 22 })
			const events = await getInWindowEventsForSubject({
				userId: user.id,
				dependentId: null,
				settings: DEFAULT_APP_SETTINGS,
				now: NOW,
				dbx: tx,
			})
			// daysUntil would be 0; minDays floor of 1 excludes it.
			expect(events.find(e => e.kind === 'birthday')).toBeUndefined()
		})
	})

	it('handles leap-day birthdays in a non-leap year (Feb 29 rolls forward)', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx, { birthMonth: 'february', birthDay: 29 })
			// nextAnnualDate rolls Feb 29 forward to next leap year via
			// JS Date overflow (Feb 29 2027 -> Mar 1 2027). Either way we
			// just verify no crash and that birthday is either absent
			// from the window or present with sane daysUntil.
			const events = await getInWindowEventsForSubject({
				userId: user.id,
				dependentId: null,
				settings: DEFAULT_APP_SETTINGS,
				now: NOW,
				dbx: tx,
			})
			const birthday = events.find(e => e.kind === 'birthday')
			if (birthday) {
				expect(birthday.daysUntil).toBeGreaterThanOrEqual(1)
			}
		})
	})

	it('sources birthday from the dependent row on a dependent-subject run', async () => {
		await withRollback(async tx => {
			const guardian = await makeUser(tx, { birthMonth: 'december', birthDay: 1 })
			const depId = `dep_${guardian.id}`
			await tx.insert(dependents).values({
				id: depId,
				name: 'Sprout',
				birthMonth: 'june',
				birthDay: 7,
				createdByUserId: guardian.id,
			})
			await tx.insert(dependentGuardianships).values({ guardianUserId: guardian.id, dependentId: depId })
			const events = await getInWindowEventsForSubject({
				userId: guardian.id,
				dependentId: depId,
				settings: DEFAULT_APP_SETTINGS,
				now: NOW,
				dbx: tx,
			})
			const birthday = events.find(e => e.kind === 'birthday')
			expect(birthday).toBeDefined()
			// Guardian's Dec 1 birthday is far out, the dependent's Jun 7 is in window.
			expect(birthday?.daysUntil).toBe(16)
		})
	})

	it('emits christmas when the tenant has it enabled and the day-count is in range', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			// Dec 1 2026: christmas is 24 days out, inside window.
			const events = await getInWindowEventsForSubject({
				userId: user.id,
				dependentId: null,
				settings: DEFAULT_APP_SETTINGS,
				now: new Date('2026-12-01T12:00:00Z'),
				dbx: tx,
			})
			const christmas = events.find(e => e.kind === 'christmas')
			expect(christmas).toBeDefined()
			expect(christmas?.matchTypes).toEqual(['christmas'])
		})
	})

	it('suppresses christmas when enableChristmasLists is off', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const events = await getInWindowEventsForSubject({
				userId: user.id,
				dependentId: null,
				settings: { ...DEFAULT_APP_SETTINGS, enableChristmasLists: false },
				now: new Date('2026-12-01T12:00:00Z'),
				dbx: tx,
			})
			expect(events.find(e => e.kind === 'christmas')).toBeUndefined()
		})
	})

	it('emits a custom-holiday event for each active row', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const holidayId = '11111111-1111-1111-1111-111111111111'
			await tx.insert(customHolidays).values({
				id: holidayId,
				title: 'Easter',
				source: 'custom',
				customMonth: 6,
				customDay: 1,
			})
			const events = await getInWindowEventsForSubject({
				userId: user.id,
				dependentId: null,
				settings: DEFAULT_APP_SETTINGS,
				now: NOW,
				dbx: tx,
			})
			const ch = events.find(e => e.kind === 'custom-holiday')
			expect(ch).toBeDefined()
			expect(ch?.customHolidayId).toBe(holidayId)
			expect(ch?.eventTitle).toBe('Easter')
			expect(ch?.matchTypes).toEqual(['holiday'])
		})
	})

	it('suppresses custom-holiday events when enableGenericHolidayLists is off', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			await tx.insert(customHolidays).values({
				id: '22222222-2222-2222-2222-222222222222',
				title: 'Easter',
				source: 'custom',
				customMonth: 6,
				customDay: 1,
			})
			const events = await getInWindowEventsForSubject({
				userId: user.id,
				dependentId: null,
				settings: { ...DEFAULT_APP_SETTINGS, enableGenericHolidayLists: false },
				now: NOW,
				dbx: tx,
			})
			expect(events.find(e => e.kind === 'custom-holiday')).toBeUndefined()
		})
	})

	it('returns events sorted ascending by occurrence', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx, { birthMonth: 'june', birthDay: 5 })
			await tx.insert(customHolidays).values({
				id: '33333333-3333-3333-3333-333333333333',
				title: 'Easter',
				source: 'custom',
				customMonth: 5,
				customDay: 30,
			})
			const events = await getInWindowEventsForSubject({
				userId: user.id,
				dependentId: null,
				settings: DEFAULT_APP_SETTINGS,
				now: NOW,
				dbx: tx,
			})
			// Easter May 30 should come before Birthday June 5.
			expect(events.length).toBeGreaterThanOrEqual(2)
			expect(events[0].kind).toBe('custom-holiday')
			expect(events[1].kind).toBe('birthday')
		})
	})

	it('returns nothing when minDays > windowDays (defensive)', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx, { birthMonth: 'june', birthDay: 5 })
			const events = await getInWindowEventsForSubject({
				userId: user.id,
				dependentId: null,
				settings: { ...DEFAULT_APP_SETTINGS, intelligenceMinDaysBeforeEventForRecs: 60, intelligenceUpcomingWindowDays: 30 },
				now: NOW,
				dbx: tx,
			})
			expect(events).toHaveLength(0)
		})
	})
})

describe('eventIsCovered', () => {
	const birthdayEvent: InWindowEvent = {
		kind: 'birthday',
		matchTypes: ['birthday', 'wishlist'],
		occurrence: new Date('2026-06-05T00:00:00Z'),
		occurrenceISO: '2026-06-05T00:00:00.000Z',
		daysUntil: 14,
		eventTitle: 'Birthday',
	}

	const christmasEvent: InWindowEvent = {
		kind: 'christmas',
		matchTypes: ['christmas'],
		occurrence: new Date('2026-12-25T00:00:00Z'),
		occurrenceISO: '2026-12-25T00:00:00.000Z',
		daysUntil: 24,
		eventTitle: 'Christmas',
	}

	const holidayEvent: InWindowEvent = {
		kind: 'custom-holiday',
		matchTypes: ['holiday'],
		customHolidayId: 'a',
		occurrence: new Date('2026-06-01T00:00:00Z'),
		occurrenceISO: '2026-06-01T00:00:00.000Z',
		daysUntil: 10,
		eventTitle: 'Easter',
	}

	it('treats a wishlist as covering birthday', () => {
		expect(eventIsCovered(birthdayEvent, [{ type: 'wishlist', customHolidayId: null, isActive: true }])).toBe(true)
	})

	it('treats a birthday-typed list as covering birthday', () => {
		expect(eventIsCovered(birthdayEvent, [{ type: 'birthday', customHolidayId: null, isActive: true }])).toBe(true)
	})

	it('treats a christmas list as NOT covering birthday', () => {
		expect(eventIsCovered(birthdayEvent, [{ type: 'christmas', customHolidayId: null, isActive: true }])).toBe(false)
	})

	it('ignores inactive lists', () => {
		expect(eventIsCovered(birthdayEvent, [{ type: 'wishlist', customHolidayId: null, isActive: false }])).toBe(false)
	})

	it('treats a christmas-typed list as covering christmas (only)', () => {
		expect(eventIsCovered(christmasEvent, [{ type: 'wishlist', customHolidayId: null, isActive: true }])).toBe(false)
		expect(eventIsCovered(christmasEvent, [{ type: 'christmas', customHolidayId: null, isActive: true }])).toBe(true)
	})

	it('matches custom-holiday only when customHolidayId aligns', () => {
		expect(eventIsCovered(holidayEvent, [{ type: 'holiday', customHolidayId: 'b', isActive: true }])).toBe(false)
		expect(eventIsCovered(holidayEvent, [{ type: 'holiday', customHolidayId: 'a', isActive: true }])).toBe(true)
	})
})
