import { describe, expect, it } from 'vitest'

import { mergeWithinTier } from '../merge'
import type { MergeContribution, ScrapeResult } from '../types'

function contribution(fromProvider: string, score: number, result: Partial<ScrapeResult>): MergeContribution {
	return {
		fromProvider,
		score,
		result: { imageUrls: [], ...result },
	}
}

describe('mergeWithinTier: edge cases', () => {
	it('returns an empty result when given no contributions (defensive)', () => {
		const merged = mergeWithinTier([])
		expect(merged.fromProvider).toBe('')
		expect(merged.result.imageUrls).toEqual([])
	})
})

describe('mergeWithinTier: single contributor', () => {
	it('returns the single contributor unchanged with its bare provider id (no merged: sentinel)', () => {
		const c = contribution('a', 5, { title: 'Widget', price: '$10', imageUrls: ['x.jpg'] })
		const merged = mergeWithinTier([c])
		expect(merged.fromProvider).toBe('a')
		expect(merged.result.title).toBe('Widget')
		expect(merged.result.price).toBe('$10')
		expect(merged.result.imageUrls).toEqual(['x.jpg'])
	})

	it('clones the result so mutating the merged value does not affect the input', () => {
		const c = contribution('a', 5, { title: 'Widget', imageUrls: ['x.jpg'] })
		const merged = mergeWithinTier([c])
		merged.result.imageUrls.push('y.jpg')
		expect(c.result.imageUrls).toEqual(['x.jpg'])
	})
})

describe('mergeWithinTier: fill-the-gaps for scalars', () => {
	it('higher-score base wins on conflicting scalars; runner-up contributes nothing', () => {
		const a = contribution('a', 5, { title: 'High Quality Widget', price: '$10' })
		const b = contribution('b', 2, { title: 'Wrong Widget', price: '$99' })
		const merged = mergeWithinTier([a, b])
		expect(merged.result.title).toBe('High Quality Widget')
		expect(merged.result.price).toBe('$10')
		expect(merged.fromProvider).toBe('a')
	})

	it('empty base scalar gets filled from highest-scoring filler with a value', () => {
		const a = contribution('a', 5, { title: 'Widget' }) // no price
		const b = contribution('b', 3, { price: '$10' })
		const c = contribution('c', 2, { price: '$99' })
		const merged = mergeWithinTier([a, b, c])
		expect(merged.result.title).toBe('Widget')
		expect(merged.result.price).toBe('$10') // b wins over c by score
		expect(merged.fromProvider).toBe('merged:a,b')
	})

	it('treats empty string as empty when filling', () => {
		const a = contribution('a', 5, { title: '' })
		const b = contribution('b', 3, { title: 'Widget' })
		const merged = mergeWithinTier([a, b])
		expect(merged.result.title).toBe('Widget')
	})

	it('treats whitespace-only string as empty when filling', () => {
		const a = contribution('a', 5, { title: '   \n  ' })
		const b = contribution('b', 3, { title: 'Widget' })
		const merged = mergeWithinTier([a, b])
		expect(merged.result.title).toBe('Widget')
	})

	it('first-non-empty by SCORE order, not by argument array order', () => {
		// Pass in [c, b, a] (lowest → highest by score).
		const a = contribution('a', 5, { title: 'A wins' })
		const b = contribution('b', 3, { title: 'B value' })
		const c = contribution('c', 1, { title: 'C value' })
		const merged = mergeWithinTier([c, b, a])
		expect(merged.result.title).toBe('A wins')
		expect(merged.fromProvider).toBe('a')
	})
})

describe('mergeWithinTier: imageUrls handling', () => {
	it('concatenates and dedupes imageUrls across all contributors', () => {
		const a = contribution('a', 5, { imageUrls: ['x.jpg', 'y.jpg'] })
		const b = contribution('b', 3, { imageUrls: ['y.jpg', 'z.jpg'] })
		const merged = mergeWithinTier([a, b])
		expect(merged.result.imageUrls).toEqual(['x.jpg', 'y.jpg', 'z.jpg'])
	})

	it('preserves base imageUrls order, appends uniques from runners-up in score order', () => {
		const a = contribution('a', 5, { imageUrls: ['x.jpg', 'y.jpg'] })
		const b = contribution('b', 3, { imageUrls: ['a.jpg'] })
		const c = contribution('c', 2, { imageUrls: ['b.jpg'] })
		const merged = mergeWithinTier([a, b, c])
		expect(merged.result.imageUrls).toEqual(['x.jpg', 'y.jpg', 'a.jpg', 'b.jpg'])
	})

	it('handles contributors with empty imageUrls without breaking the merge', () => {
		const a = contribution('a', 5, { imageUrls: ['x.jpg'] })
		const b = contribution('b', 3, { imageUrls: [] })
		const merged = mergeWithinTier([a, b])
		expect(merged.result.imageUrls).toEqual(['x.jpg'])
	})
})

describe('mergeWithinTier: finalUrl', () => {
	it('finalUrl fills from runner-up when base has none', () => {
		const a = contribution('a', 5, { title: 'Widget' }) // no finalUrl
		const b = contribution('b', 2, { finalUrl: 'https://example.com/redirected' })
		const merged = mergeWithinTier([a, b])
		expect(merged.result.finalUrl).toBe('https://example.com/redirected')
		expect(merged.fromProvider).toBe('merged:a,b')
	})

	it('base finalUrl wins when present', () => {
		const a = contribution('a', 5, { finalUrl: 'https://a.example/x' })
		const b = contribution('b', 2, { finalUrl: 'https://b.example/y' })
		const merged = mergeWithinTier([a, b])
		expect(merged.result.finalUrl).toBe('https://a.example/x')
	})
})

describe('mergeWithinTier: provenance tracking', () => {
	it('fromProvider is just the base id when runners-up filled nothing', () => {
		const a = contribution('a', 5, { title: 'A', price: '$10', imageUrls: ['x.jpg'] })
		const b = contribution('b', 3, { title: 'B', price: '$99' }) // both fields already on base
		const merged = mergeWithinTier([a, b])
		expect(merged.fromProvider).toBe('a')
	})

	it('fromProvider becomes merged:a,b when at least one field came from b', () => {
		const a = contribution('a', 5, { title: 'A' })
		const b = contribution('b', 3, { price: '$10' })
		const merged = mergeWithinTier([a, b])
		expect(merged.fromProvider).toBe('merged:a,b')
	})

	it('merged: sentinel preserves contributor order by score (highest first)', () => {
		const a = contribution('a', 5, { title: 'A' })
		const b = contribution('b', 4, { price: '$10' })
		const c = contribution('c', 3, { description: 'desc' })
		const merged = mergeWithinTier([c, a, b]) // pass out-of-order
		expect(merged.fromProvider).toBe('merged:a,b,c')
	})

	it('merged: sentinel only includes contributors that actually filled a field', () => {
		// b's price would fill but a's price already exists; b never contributes.
		const a = contribution('a', 5, { title: 'A', price: '$10' })
		const b = contribution('b', 4, { price: '$99' }) // ignored
		const c = contribution('c', 3, { description: 'desc' }) // contributes
		const merged = mergeWithinTier([a, b, c])
		expect(merged.fromProvider).toBe('merged:a,c')
	})

	it('imageUrl-only contributors are still credited in the merged: sentinel', () => {
		const a = contribution('a', 5, { title: 'A', price: '$10' })
		const b = contribution('b', 3, { imageUrls: ['extra.jpg'] })
		const merged = mergeWithinTier([a, b])
		expect(merged.result.imageUrls).toContain('extra.jpg')
		expect(merged.fromProvider).toBe('merged:a,b')
	})
})

describe('mergeWithinTier: purchaseVariants handling', () => {
	it('unions purchaseVariants across all contributors, base order first then runners-up', () => {
		const a = contribution('a', 5, { purchaseVariants: ['Color', 'Size'] })
		const b = contribution('b', 3, { purchaseVariants: ['Material'] })
		const c = contribution('c', 2, { purchaseVariants: ['Style'] })
		const merged = mergeWithinTier([a, b, c])
		expect(merged.result.purchaseVariants).toEqual(['Color', 'Size', 'Material', 'Style'])
	})

	it('dedupes case-insensitively (first casing wins)', () => {
		const a = contribution('a', 5, { purchaseVariants: ['Color'] })
		const b = contribution('b', 3, { purchaseVariants: ['color', 'Size'] })
		const merged = mergeWithinTier([a, b])
		expect(merged.result.purchaseVariants).toEqual(['Color', 'Size'])
	})

	it('credits a runner-up in the merged: sentinel when it adds at least one new axis', () => {
		const a = contribution('a', 5, { title: 'A', purchaseVariants: ['Color'] })
		const b = contribution('b', 3, { purchaseVariants: ['Size'] })
		const merged = mergeWithinTier([a, b])
		expect(merged.result.purchaseVariants).toEqual(['Color', 'Size'])
		expect(merged.fromProvider).toBe('merged:a,b')
	})

	it('does not credit a runner-up when its axes are already in the base', () => {
		const a = contribution('a', 5, { title: 'A', purchaseVariants: ['Color', 'Size'] })
		const b = contribution('b', 3, { purchaseVariants: ['color'] })
		const merged = mergeWithinTier([a, b])
		expect(merged.fromProvider).toBe('a')
	})

	it('handles contributors with no purchaseVariants without breaking the merge', () => {
		const a = contribution('a', 5, { purchaseVariants: ['Color'] })
		const b = contribution('b', 3, {})
		const merged = mergeWithinTier([a, b])
		expect(merged.result.purchaseVariants).toEqual(['Color'])
	})
})
