import { describe, expect, it } from 'vitest'

import { formatRelative } from '@/lib/format-relative'
import { formatGifterNames } from '@/lib/gifters'
import { formatList } from '@/lib/i18n/format'
import { TEXT_SIZE_STEPS, textSizeName } from '@/lib/text-size'
import { formatTimeframeLabel, TIMEFRAME_PRESETS, timeframePresetLabel, timeframePresetShortLabel } from '@/lib/timeframe'
import { m } from '@/paraglide/messages.js'

// The shared helpers plan 36c moved onto the message catalog. English must
// read exactly as it did before.

describe('formatGifterNames', () => {
	it('joins names the way gift attribution always has', () => {
		expect(formatGifterNames(['Alice', 'Bob'])).toBe('Alice & Bob')
		expect(formatGifterNames(['Alice', 'Bob', 'Carol'])).toBe('Alice, Bob & Carol')
	})

	it('uses the French joining word for a French reader', () => {
		expect(formatGifterNames(['Alice'], 'fr')).toBe('Alice')
		expect(formatGifterNames(['Alice', 'Bob'], 'fr')).toBe('Alice et Bob')
		expect(formatGifterNames(['Alice', 'Bob', 'Carol', 'Dan'], 'fr')).toBe('Alice, Bob, Carol et Dan')
	})
})

describe('formatList', () => {
	it('writes a list inside a sentence', () => {
		expect(formatList(['Mom'])).toBe('Mom')
		expect(formatList(['Mom', 'Dad'])).toBe('Mom and Dad')
		expect(formatList(['Mom', 'Dad', 'Nana'])).toBe('Mom, Dad, and Nana')
		expect(formatList(['Mom', 'Dad', 'Nana'], 'conjunction', 'fr')).toBe('Mom, Dad et Nana')
		expect(formatList(['a link', 'a barcode'], 'disjunction')).toBe('a link or a barcode')
	})
})

describe('formatRelative', () => {
	const now = Date.parse('2026-11-18T12:00:00Z')

	it('keeps its English words', () => {
		expect(formatRelative(null, now)).toBe('never')
		expect(formatRelative('not a date', now)).toBe('unknown')
		expect(formatRelative('2026-11-18T11:59:40Z', now)).toBe('just now')
		expect(formatRelative('2026-11-17T12:00:00Z', now)).toBe('yesterday')
		expect(formatRelative('2026-11-18T15:00:00Z', now)).toBe('in 3 hours')
	})
})

describe('timeframe presets', () => {
	it('names every preset, long and short', () => {
		expect(TIMEFRAME_PRESETS.map(timeframePresetLabel)).toEqual([
			'Last 30 days',
			'Last 60 days',
			'Last 6 months',
			'Last 12 months',
			'All time',
		])
		expect(TIMEFRAME_PRESETS.map(timeframePresetShortLabel)).toEqual(['30d', '60d', '6m', '12m', 'All time'])
		expect(formatTimeframeLabel({ kind: 'preset', preset: '6m' })).toBe('Last 6 months')
	})
})

describe('text size names', () => {
	it('names every step', () => {
		expect(TEXT_SIZE_STEPS.map(textSizeName)).toEqual(['Smaller', 'Small', 'Default', 'Large', 'Larger'])
	})
})

describe('day counts', () => {
	it('pluralizes per language', () => {
		expect(m.count_days({ count: 1 })).toBe('1 day')
		expect(m.count_days({ count: 12 })).toBe('12 days')
		expect(m.count_days({ count: 0 })).toBe('0 days')
		// French counts 0 and 1 as singular.
		expect(m.count_days({ count: 0 }, { locale: 'fr' })).toBe('0 jour')
		expect(m.count_days({ count: 1 }, { locale: 'fr' })).toBe('1 jour')
		expect(m.count_days({ count: 12 }, { locale: 'fr' })).toBe('12 jours')
	})
})
