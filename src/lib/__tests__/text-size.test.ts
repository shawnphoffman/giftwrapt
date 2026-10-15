import { describe, expect, it } from 'vitest'

import { DEFAULT_TEXT_SIZE, parseTextSize, readTextSizeCookie, resolveTextSize, TEXT_SIZE_STEPS, textSizeStyle } from '../text-size'

describe('parseTextSize', () => {
	it('accepts every step', () => {
		for (const step of TEXT_SIZE_STEPS) expect(parseTextSize(String(step))).toBe(step)
	})

	it('treats anything else as 100', () => {
		for (const value of [null, undefined, '', '110', '112.50x', 'abc', '-90', '1e2', '125%', ' 0 ']) {
			expect(parseTextSize(value)).toBe(DEFAULT_TEXT_SIZE)
		}
	})

	it('ignores surrounding whitespace', () => {
		expect(parseTextSize(' 112.5 ')).toBe(112.5)
	})
})

describe('readTextSizeCookie', () => {
	it('finds the cookie among others', () => {
		expect(readTextSizeCookie('a=1; gw-text-size=125; b=2')).toBe('125')
	})

	it('returns null when it is absent', () => {
		expect(readTextSizeCookie('a=1; gw-text-size-x=125')).toBeNull()
		expect(readTextSizeCookie('')).toBeNull()
	})
})

describe('resolveTextSize', () => {
	it('uses the cookie, embedded or not (30d will map Dynamic Type here)', () => {
		expect(resolveTextSize({ cookie: '95', embedded: false })).toBe(95)
		expect(resolveTextSize({ cookie: '95', embedded: true })).toBe(95)
	})
})

describe('textSizeStyle', () => {
	it('adds nothing at the default', () => {
		expect(textSizeStyle(100)).toBeUndefined()
	})

	it('sets the root font size as a percent', () => {
		expect(textSizeStyle(112.5)).toEqual({ fontSize: '112.5%' })
	})
})
