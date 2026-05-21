import { describe, expect, it } from 'vitest'

import { jaccard, tokenSet } from '../text-similarity'

describe('tokenSet', () => {
	it('lowercases, strips punctuation, splits on whitespace', () => {
		expect(tokenSet('Sony WH-1000XM4 Black')).toEqual(new Set(['sony', 'wh', '1000xm4', 'black']))
		expect(tokenSet('LEGO Star Wars X-Wing')).toEqual(new Set(['lego', 'star', 'wars', 'x', 'wing']))
	})

	it('returns an empty set for empty / whitespace-only input', () => {
		expect(tokenSet('')).toEqual(new Set())
		expect(tokenSet('   ')).toEqual(new Set())
	})

	it('collapses repeated tokens into one entry (set semantics)', () => {
		expect(tokenSet('foo foo foo')).toEqual(new Set(['foo']))
	})
})

describe('jaccard', () => {
	it('returns 1 for identical token sets', () => {
		expect(jaccard(tokenSet('Apple AirPods Pro'), tokenSet('apple airpods pro'))).toBe(1)
	})

	it('returns 0 when either set is empty', () => {
		expect(jaccard(tokenSet(''), tokenSet('hello'))).toBe(0)
		expect(jaccard(tokenSet('hello'), tokenSet(''))).toBe(0)
		// Convention: two empty sets are NOT a match (safer than 1).
		expect(jaccard(tokenSet(''), tokenSet(''))).toBe(0)
	})

	it('is order-independent', () => {
		expect(jaccard(tokenSet('Apple AirPods Pro'), tokenSet('AirPods Pro Apple'))).toBe(1)
	})

	it('mid-range similarity for partial overlap', () => {
		// {sony, xm4} vs {sony, xm4, black} -> intersection 2, union 3.
		expect(jaccard(tokenSet('Sony XM4'), tokenSet('Sony XM4 Black'))).toBeCloseTo(2 / 3, 5)
	})

	it('high similarity for SKU-suffixed product titles', () => {
		// {lego, star, wars, x, wing} vs {lego, star, wars, x, wing, 75355}
		expect(jaccard(tokenSet('Lego Star Wars X-Wing'), tokenSet('LEGO Star Wars X-Wing 75355'))).toBeCloseTo(5 / 6, 5)
	})

	it('low similarity for unrelated titles', () => {
		expect(jaccard(tokenSet('Sony WH-1000XM4'), tokenSet('Bose QuietComfort 45'))).toBe(0)
	})
})
