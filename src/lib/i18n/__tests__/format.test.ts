import { describe, expect, it } from 'vitest'

import {
	currencySymbol,
	currentLocale,
	dateFnsLocale,
	formatCalendarDate,
	formatCurrency,
	formatDate,
	formatItemPrice,
	formatNumber,
	formatTimeAgo,
	intlTag,
	normalizeAmountInput,
	parseAmount,
	relativeTimeFormat,
} from '@/lib/i18n/format'

// 2026-11-05T17:30:00Z. Instants are formatted with an explicit time zone
// here so the expectations do not depend on the machine running the tests.
const INSTANT = '2026-11-05T17:30:00Z'
const UTC = { timeZone: 'UTC' } as const

describe('formatting with no request', () => {
	it('uses the base locale', () => {
		expect(currentLocale()).toBe('en')
		expect(intlTag()).toBe('en-US')
		expect(dateFnsLocale().code).toBe('en-US')
	})
})

describe('formatDate', () => {
	it('keeps the English output the app had before', () => {
		expect(formatDate(INSTANT, { month: 'short', day: 'numeric', year: 'numeric', ...UTC })).toBe('Nov 5, 2026')
		expect(formatDate(INSTANT, { month: 'long', day: 'numeric', year: 'numeric', ...UTC })).toBe('November 5, 2026')
		expect(formatDate(INSTANT, { month: 'short', day: 'numeric', ...UTC })).toBe('Nov 5')
		expect(formatDate(INSTANT, { month: 'short', year: '2-digit', ...UTC })).toBe('Nov 26')
		expect(formatDate(INSTANT, { hour: 'numeric', minute: '2-digit', ...UTC })).toMatch(/^5:30\sPM$/)
	})

	it('follows French order and month names', () => {
		expect(formatDate(INSTANT, { month: 'short', day: 'numeric', year: 'numeric', ...UTC }, 'fr')).toBe('5 nov. 2026')
		expect(formatDate(INSTANT, { month: 'long', day: 'numeric', year: 'numeric', ...UTC }, 'fr')).toBe('5 novembre 2026')
		expect(formatDate(INSTANT, { hour: 'numeric', minute: '2-digit', ...UTC }, 'fr')).toBe('17:30')
	})

	it('accepts a Date, a string or a timestamp, and returns an empty string for none of them', () => {
		const options = { month: 'short', day: 'numeric', ...UTC } as const
		expect(formatDate(new Date(INSTANT), options)).toBe('Nov 5')
		expect(formatDate(Date.parse(INSTANT), options)).toBe('Nov 5')
		expect(formatDate('not a date', options)).toBe('')
	})
})

describe('formatCalendarDate', () => {
	it('never shifts a calendar date, whatever zone it is asked for in', () => {
		const christmas = '2026-12-25T00:00:00Z'
		expect(formatCalendarDate(christmas, { month: 'short', day: 'numeric' })).toBe('Dec 25')
		expect(formatCalendarDate(christmas, { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' })).toBe('Dec 25')
		expect(formatCalendarDate(christmas, { month: 'long', day: 'numeric' }, 'fr')).toBe('25 décembre')
	})
})

describe('formatNumber', () => {
	it('groups digits the way each language does', () => {
		expect(formatNumber(1234567)).toBe('1,234,567')
		// French groups with a narrow no-break space.
		expect(formatNumber(1234567, {}, 'fr')).toBe('1 234 567')
		expect(formatNumber(0.5, { style: 'percent' }, 'fr')).toBe('50 %')
	})
})

describe('relative time', () => {
	it('words relative units per language', () => {
		expect(relativeTimeFormat().format(-1, 'day')).toBe('yesterday')
		expect(relativeTimeFormat('fr').format(-1, 'day')).toBe('hier')
		expect(relativeTimeFormat('fr').format(2, 'hour')).toBe('dans 2 heures')
	})

	it('describes how long ago something happened', () => {
		const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000)
		expect(formatTimeAgo(threeHoursAgo)).toBe('about 3 hours ago')
		expect(formatTimeAgo(threeHoursAgo, 'fr')).toBe('il y a environ 3 heures')
		expect(formatTimeAgo('not a date')).toBe('')
	})
})

describe('formatCurrency', () => {
	it('puts the symbol where each language expects it', () => {
		expect(formatCurrency(12.5, 'EUR', {}, 'en')).toBe('€12.50')
		expect(formatCurrency(12.5, 'EUR', {}, 'fr').replace(/\s/g, ' ')).toBe('12,50 €')
		expect(formatCurrency(12.5, 'USD', {}, 'en')).toBe('$12.50')
	})

	it('drops the cents from a round amount only when asked', () => {
		expect(formatCurrency(25, 'USD', {}, 'en')).toBe('$25.00')
		expect(formatCurrency(25, 'USD', { wholeWhenRound: true }, 'en')).toBe('$25')
		expect(formatCurrency(25.5, 'USD', { wholeWhenRound: true }, 'en')).toBe('$25.50')
	})

	it('accepts a lower-case code and survives an unknown one', () => {
		expect(formatCurrency(3, 'eur', {}, 'en')).toBe('€3.00')
		expect(formatCurrency(3, 'credits', {}, 'en')).toBe('3.00 credits')
		expect(formatCurrency(3, null, {}, 'en')).toBe('3.00')
	})
})

describe('parseAmount and normalizeAmountInput', () => {
	it('reads a point or a comma as the decimal mark', () => {
		expect(parseAmount('12.50')).toBe(12.5)
		expect(parseAmount('12,50')).toBe(12.5)
		expect(parseAmount(' 28 ')).toBe(28)
	})

	it('does not guess at anything else', () => {
		expect(parseAmount('12 each')).toBeNull()
		expect(parseAmount('$45-60')).toBeNull()
		expect(parseAmount('1,200')).toBeNull()
		expect(parseAmount('')).toBeNull()
		expect(parseAmount(null)).toBeNull()
	})

	it('stores a comma decimal with a point and leaves the rest alone', () => {
		expect(normalizeAmountInput('12,5')).toBe('12.5')
		expect(normalizeAmountInput(' 12.50 ')).toBe('12.50')
		expect(normalizeAmountInput('1,200')).toBe('1,200')
		expect(normalizeAmountInput('abc')).toBe('abc')
	})
})

describe('formatItemPrice', () => {
	it('shows a plain amount as money in the stored currency', () => {
		expect(formatItemPrice('12.5', 'EUR', 'USD', 'en')).toBe('€12.50')
		expect(formatItemPrice('12,5', 'EUR', 'USD', 'fr').replace(/\s/g, ' ')).toBe('12,50 €')
	})

	it('falls back to the given currency when none is stored', () => {
		expect(formatItemPrice('28', null, 'USD', 'en')).toBe('$28')
		expect(formatItemPrice('28', '', 'CAD', 'en')).toBe('CA$28')
	})

	it('leaves free text exactly as typed', () => {
		expect(formatItemPrice('12 each', 'EUR', 'USD', 'fr')).toBe('12 each')
		expect(formatItemPrice(' $45-60 ', null, 'USD', 'en')).toBe('$45-60')
	})
})

describe('currencySymbol', () => {
	it('gives the symbol for a field adornment', () => {
		expect(currencySymbol('USD', 'en')).toBe('$')
		expect(currencySymbol('EUR', 'fr')).toBe('€')
		expect(currencySymbol('nope!', 'en')).toBe('nope!')
	})
})
