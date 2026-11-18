import { describe, expect, it } from 'vitest'

import { birthMonthEnumValues, listTypeEnumValues, ListTypes, priorityEnumValues } from '@/db/schema/enums'
import { formatMonthDay, listTypeLabel, monthName, priorityLabel } from '@/lib/i18n/labels'

describe('priorityLabel', () => {
	it('names every priority in both languages', () => {
		expect(priorityEnumValues.map(p => priorityLabel(p))).toEqual(expect.arrayContaining(['Very High', 'High', 'Normal', 'Low']))
		expect(priorityLabel('very-high', 'fr')).toBe('Très élevée')
		for (const p of priorityEnumValues) expect(priorityLabel(p, 'fr')).not.toBe('')
	})
})

describe('listTypeLabel', () => {
	it('matches the English names the schema file has always used', () => {
		for (const type of listTypeEnumValues) expect(listTypeLabel(type)).toBe(ListTypes[type])
	})

	it('has a French name for every type', () => {
		expect(listTypeLabel('wishlist', 'fr')).toBe('Liste de souhaits')
		for (const type of listTypeEnumValues) expect(listTypeLabel(type, 'fr')).not.toBe('')
	})
})

describe('months', () => {
	it('names a month from its enum value or its number', () => {
		expect(birthMonthEnumValues.map(mo => monthName(mo))).toEqual([
			'January',
			'February',
			'March',
			'April',
			'May',
			'June',
			'July',
			'August',
			'September',
			'October',
			'November',
			'December',
		])
		expect(monthName(1)).toBe('January')
		expect(monthName(12)).toBe('December')
		expect(monthName('august', 'fr')).toBe('août')
	})

	it('formats a yearly date with as much as is known', () => {
		expect(formatMonthDay('january')).toBe('January')
		expect(formatMonthDay('january', 9)).toBe('January 9')
		expect(formatMonthDay('january', 9, 1990)).toBe('January 9, 1990')
		expect(formatMonthDay('february', 29)).toBe('February 29')
		expect(formatMonthDay('january', null, 1990)).toBe('January')
		expect(formatMonthDay('january', 9, null, 'fr')).toBe('9 janvier')
		expect(formatMonthDay('january', 9, 1990, 'fr')).toBe('9 janvier 1990')
	})
})
