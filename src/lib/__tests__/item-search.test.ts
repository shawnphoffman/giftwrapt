import { describe, expect, it } from 'vitest'

import { escapeLikePattern, MIN_ITEM_SEARCH_QUERY_LENGTH, tokenizeItemSearchQuery } from '../item-search'

describe('tokenizeItemSearchQuery', () => {
	it('returns nothing below the minimum query length', () => {
		expect(tokenizeItemSearchQuery('ba')).toEqual([])
		expect(tokenizeItemSearchQuery('  b  ')).toEqual([])
		expect(tokenizeItemSearchQuery('')).toEqual([])
		expect('ba'.length).toBeLessThan(MIN_ITEM_SEARCH_QUERY_LENGTH)
	})

	it('returns a single token for a one-word query', () => {
		expect(tokenizeItemSearchQuery('bass')).toEqual(['bass'])
	})

	it('trims and splits on any run of whitespace', () => {
		expect(tokenizeItemSearchQuery('  bass   guitar\tstrap ')).toEqual(['bass', 'guitar', 'strap'])
	})

	it('counts the trimmed length, not the raw length, against the minimum', () => {
		expect(tokenizeItemSearchQuery('  ab  ')).toEqual([])
		expect(tokenizeItemSearchQuery('  abc  ')).toEqual(['abc'])
	})
})

describe('escapeLikePattern', () => {
	it('leaves ordinary text alone', () => {
		expect(escapeLikePattern('bass guitar')).toBe('bass guitar')
	})

	it('escapes LIKE wildcards so they match literally', () => {
		expect(escapeLikePattern('100%')).toBe('100\\%')
		expect(escapeLikePattern('a_b')).toBe('a\\_b')
	})

	it('escapes the escape character itself', () => {
		expect(escapeLikePattern('back\\slash')).toBe('back\\\\slash')
	})

	it('escapes every occurrence', () => {
		expect(escapeLikePattern('%_%')).toBe('\\%\\_\\%')
	})
})
