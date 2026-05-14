// Coverage for the calendar-only warning helper. Verifies every
// warning branch fires when it should, that no-coverage-loss paths
// stay silent, and that the spoiler-protection invariant holds
// (claim signals are never referenced).

import { describe, expect, it } from 'vitest'

import type { InWindowEvent } from '@/lib/intelligence/upcoming-events'

import { evaluateListChangeImpact, type ListChangeImpactList } from '../list-change-impact'

const birthdayEvent: InWindowEvent = {
	kind: 'birthday',
	matchTypes: ['birthday', 'wishlist'],
	occurrence: new Date('2026-06-05T00:00:00Z'),
	occurrenceISO: '2026-06-05T00:00:00.000Z',
	daysUntil: 12,
	eventTitle: 'Birthday',
}

const christmasEvent: InWindowEvent = {
	kind: 'christmas',
	matchTypes: ['christmas'],
	occurrence: new Date('2026-12-25T00:00:00Z'),
	occurrenceISO: '2026-12-25T00:00:00.000Z',
	daysUntil: 14,
	eventTitle: 'Christmas',
}

const easterEvent: InWindowEvent = {
	kind: 'custom-holiday',
	matchTypes: ['holiday'],
	customHolidayId: 'easter-id',
	occurrence: new Date('2026-04-05T00:00:00Z'),
	occurrenceISO: '2026-04-05T00:00:00.000Z',
	daysUntil: 20,
	eventTitle: 'Easter',
}

const birthdayList: ListChangeImpactList = {
	id: 1,
	type: 'birthday',
	customHolidayId: null,
	isActive: true,
}

const christmasList: ListChangeImpactList = {
	id: 2,
	type: 'christmas',
	customHolidayId: null,
	isActive: true,
}

const easterList: ListChangeImpactList = {
	id: 3,
	type: 'holiday',
	customHolidayId: 'easter-id',
	isActive: true,
}

describe('evaluateListChangeImpact', () => {
	describe('type changes', () => {
		it('warns when changing type AWAY from one that covers an in-window event with no backup', () => {
			const { warnings } = evaluateListChangeImpact({
				list: birthdayList,
				proposed: { type: 'todos' },
				inWindowEvents: [birthdayEvent],
				otherSubjectLists: [],
			})
			expect(warnings).toHaveLength(1)
			expect(warnings[0].kind).toBe('type-away')
			expect(warnings[0].text).toContain('Birthday is in 12 days')
		})

		it('stays silent when changing type TOWARD a matching type', () => {
			const { warnings } = evaluateListChangeImpact({
				list: christmasList,
				proposed: { type: 'birthday' },
				inWindowEvents: [birthdayEvent],
				otherSubjectLists: [],
			})
			expect(warnings).toHaveLength(0)
		})

		it('stays silent when another subject list covers the event', () => {
			const wishlistBackup: ListChangeImpactList = { id: 99, type: 'wishlist', customHolidayId: null, isActive: true }
			const { warnings } = evaluateListChangeImpact({
				list: birthdayList,
				proposed: { type: 'todos' },
				inWindowEvents: [birthdayEvent],
				otherSubjectLists: [wishlistBackup],
			})
			expect(warnings).toHaveLength(0)
		})

		it('stays silent when no event is in window', () => {
			const { warnings } = evaluateListChangeImpact({
				list: birthdayList,
				proposed: { type: 'todos' },
				inWindowEvents: [],
				otherSubjectLists: [],
			})
			expect(warnings).toHaveLength(0)
		})

		it('does not falsely warn when ALL subject lists are inactive backups', () => {
			const inactiveBackup: ListChangeImpactList = { id: 99, type: 'wishlist', customHolidayId: null, isActive: false }
			const { warnings } = evaluateListChangeImpact({
				list: birthdayList,
				proposed: { type: 'todos' },
				inWindowEvents: [birthdayEvent],
				otherSubjectLists: [inactiveBackup],
			})
			expect(warnings).toHaveLength(1)
			expect(warnings[0].kind).toBe('type-away')
		})
	})

	describe('customHolidayId changes', () => {
		it('warns when rebinding a holiday list away from an in-window custom holiday', () => {
			const { warnings } = evaluateListChangeImpact({
				list: easterList,
				proposed: { customHolidayId: 'halloween-id' },
				inWindowEvents: [easterEvent],
				otherSubjectLists: [],
			})
			expect(warnings).toHaveLength(1)
			expect(warnings[0].kind).toBe('customHolidayId-away')
			expect(warnings[0].text).toContain('Easter is in 20 days')
		})

		it('stays silent when other holiday-typed list covers the same customHolidayId', () => {
			const backup: ListChangeImpactList = { id: 99, type: 'holiday', customHolidayId: 'easter-id', isActive: true }
			const { warnings } = evaluateListChangeImpact({
				list: easterList,
				proposed: { customHolidayId: 'halloween-id' },
				inWindowEvents: [easterEvent],
				otherSubjectLists: [backup],
			})
			expect(warnings).toHaveLength(0)
		})
	})

	describe('archive', () => {
		it('warns when archiving the only list covering an in-window event', () => {
			const { warnings } = evaluateListChangeImpact({
				list: christmasList,
				proposed: { isActive: false },
				inWindowEvents: [christmasEvent],
				otherSubjectLists: [],
			})
			expect(warnings).toHaveLength(1)
			expect(warnings[0].kind).toBe('archive')
			expect(warnings[0].text).toContain('Archiving')
		})
	})

	describe('delete', () => {
		it('warns when deleting the only list covering an in-window event', () => {
			const { warnings } = evaluateListChangeImpact({
				list: christmasList,
				proposed: { delete: true },
				inWindowEvents: [christmasEvent],
				otherSubjectLists: [],
			})
			expect(warnings).toHaveLength(1)
			expect(warnings[0].kind).toBe('delete')
			expect(warnings[0].text).toContain('Deleting')
		})

		it('uses delete (most specific) when both delete and isActive=false are set', () => {
			const { warnings } = evaluateListChangeImpact({
				list: christmasList,
				proposed: { delete: true, isActive: false },
				inWindowEvents: [christmasEvent],
				otherSubjectLists: [],
			})
			expect(warnings).toHaveLength(1)
			expect(warnings[0].kind).toBe('delete')
		})
	})

	describe('multi-event windows', () => {
		it('warns once per affected event', () => {
			// A wishlist covers birthday only. Changing to christmas covers
			// christmas but not birthday. Birthday loses coverage; christmas
			// gains it (so the existing christmas event isn't affected).
			const wishlist: ListChangeImpactList = { id: 5, type: 'wishlist', customHolidayId: null, isActive: true }
			const { warnings } = evaluateListChangeImpact({
				list: wishlist,
				proposed: { type: 'christmas' },
				inWindowEvents: [birthdayEvent, christmasEvent],
				otherSubjectLists: [],
			})
			expect(warnings).toHaveLength(1)
			expect(warnings[0].text).toContain('Birthday')
		})
	})

	describe('day-count formatting', () => {
		it('says "tomorrow" when daysUntil=1', () => {
			const tomorrowEvent: InWindowEvent = { ...christmasEvent, daysUntil: 1 }
			const { warnings } = evaluateListChangeImpact({
				list: christmasList,
				proposed: { type: 'todos' },
				inWindowEvents: [tomorrowEvent],
				otherSubjectLists: [],
			})
			expect(warnings[0].text).toContain('tomorrow')
		})

		it('says "today" when daysUntil=0', () => {
			const todayEvent: InWindowEvent = { ...christmasEvent, daysUntil: 0 }
			const { warnings } = evaluateListChangeImpact({
				list: christmasList,
				proposed: { type: 'todos' },
				inWindowEvents: [todayEvent],
				otherSubjectLists: [],
			})
			expect(warnings[0].text).toContain('today')
		})
	})

	describe('spoiler-protection invariant', () => {
		it('never references claim presence in warning text', () => {
			const { warnings } = evaluateListChangeImpact({
				list: birthdayList,
				proposed: { type: 'todos' },
				inWindowEvents: [birthdayEvent],
				otherSubjectLists: [],
			})
			for (const w of warnings) {
				expect(w.text).not.toMatch(/claim/i)
				expect(w.text).not.toMatch(/gifter/i)
				expect(w.text).not.toMatch(/purchas/i)
				expect(w.text).not.toMatch(/bought/i)
			}
		})
	})
})
