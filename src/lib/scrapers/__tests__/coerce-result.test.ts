import { describe, expect, it } from 'vitest'

import { coerceScrapeResult, scrapeResultModelSchema, scrapeResultSchema } from '../types'

// `coerceScrapeResult` is the bridge between the loosened model-facing
// schema (no min/max on numbers; required because Gemini's structured
// output rejects those constraints) and the strict app-side schema. The
// rule is: drop out-of-range rating values rather than failing the
// whole extraction, since the model occasionally hallucinates a raw
// N-of-5 instead of the normalized 0..1 fraction we asked for.

describe('coerceScrapeResult', () => {
	it('passes through a valid result unchanged', () => {
		const out = coerceScrapeResult({
			title: 'Widget',
			description: 'A widget',
			imageUrls: ['https://example.com/w.jpg'],
			ratingValue: 0.84,
			ratingCount: 1200,
		})
		expect(out).toEqual({
			title: 'Widget',
			description: 'A widget',
			imageUrls: ['https://example.com/w.jpg'],
			ratingValue: 0.84,
			ratingCount: 1200,
		})
	})

	it('drops ratingValue outside [0, 1]', () => {
		// Model returned the raw 4.2-of-5 instead of normalizing.
		const out = coerceScrapeResult({ title: 'X', imageUrls: [], ratingValue: 4.2 })
		expect(out.ratingValue).toBeUndefined()
		expect(out.title).toBe('X')
	})

	it('drops negative ratingValue', () => {
		const out = coerceScrapeResult({ title: 'X', imageUrls: [], ratingValue: -0.1 })
		expect(out.ratingValue).toBeUndefined()
	})

	it('keeps exact bounds 0 and 1', () => {
		const lo = coerceScrapeResult({ title: 'X', imageUrls: [], ratingValue: 0 })
		const hi = coerceScrapeResult({ title: 'X', imageUrls: [], ratingValue: 1 })
		expect(lo.ratingValue).toBe(0)
		expect(hi.ratingValue).toBe(1)
	})

	it('floors a non-integer ratingCount', () => {
		const out = coerceScrapeResult({ title: 'X', imageUrls: [], ratingCount: 1200.7 })
		expect(out.ratingCount).toBe(1200)
	})

	it('drops a negative ratingCount', () => {
		const out = coerceScrapeResult({ title: 'X', imageUrls: [], ratingCount: -3 })
		expect(out.ratingCount).toBeUndefined()
	})

	it('passes undefined ratings through', () => {
		const out = coerceScrapeResult({ title: 'X', imageUrls: [] })
		expect(out.ratingValue).toBeUndefined()
		expect(out.ratingCount).toBeUndefined()
	})
})

describe('scrapeResultModelSchema', () => {
	it('accepts numbers outside the strict bounds (the whole point)', () => {
		// scrapeResultSchema would reject these.
		expect(() => scrapeResultModelSchema.parse({ title: 'X', ratingValue: 4.2 })).not.toThrow()
		expect(() => scrapeResultModelSchema.parse({ title: 'X', ratingCount: 1200.7 })).not.toThrow()
		expect(() => scrapeResultSchema.parse({ title: 'X', ratingValue: 4.2 })).toThrow()
		expect(() => scrapeResultSchema.parse({ title: 'X', ratingCount: 1200.7 })).toThrow()
	})
})
