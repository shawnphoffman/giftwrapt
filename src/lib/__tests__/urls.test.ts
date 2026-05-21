import { describe, expect, it } from 'vitest'

import { normalizeProductUrl } from '../urls'

describe('normalizeProductUrl', () => {
	it('returns null for empty / nullish inputs', () => {
		expect(normalizeProductUrl(null)).toBeNull()
		expect(normalizeProductUrl(undefined)).toBeNull()
		expect(normalizeProductUrl('')).toBeNull()
		expect(normalizeProductUrl('   ')).toBeNull()
	})

	it('strips scheme, www, query, and fragment', () => {
		expect(normalizeProductUrl('https://www.example.com/products/widget?utm=foo#tab')).toBe('example.com/products/widget')
		expect(normalizeProductUrl('http://example.com/products/widget')).toBe('example.com/products/widget')
		expect(normalizeProductUrl('example.com/products/widget?ref=abc')).toBe('example.com/products/widget')
	})

	it('strips trailing slash but preserves root', () => {
		expect(normalizeProductUrl('https://example.com/products/widget/')).toBe('example.com/products/widget')
		expect(normalizeProductUrl('https://example.com/')).toBe('example.com/')
		expect(normalizeProductUrl('https://example.com')).toBe('example.com/')
	})

	it('lowercases the host but keeps the path case-sensitive', () => {
		// Some retailers (notably Amazon ASIN paths) treat path case as
		// significant. Two URLs that differ only in case on the path are
		// safer to NOT collapse, even though they often do point at the
		// same thing.
		expect(normalizeProductUrl('https://AMAZON.com/dp/B0XYZ123')).toBe('amazon.com/dp/B0XYZ123')
		expect(normalizeProductUrl('https://amazon.com/dp/b0xyz123')).toBe('amazon.com/dp/b0xyz123')
	})

	it('two equivalent URLs normalize to the same key', () => {
		const a = normalizeProductUrl('https://www.amazon.com/dp/B0XYZ?th=1&ref_=foo')
		const b = normalizeProductUrl('http://amazon.com/dp/B0XYZ?ref=abc#bar')
		expect(a).toBe(b)
		expect(a).toBe('amazon.com/dp/B0XYZ')
	})

	it('handles parser failure via the regex fallback', () => {
		// `new URL(...)` rejects bare host-only strings without scheme;
		// the regex fallback recovers them.
		expect(normalizeProductUrl('shop.example.org/item/123')).toBe('shop.example.org/item/123')
		// Garbage in => null out (no host parseable at all).
		expect(normalizeProductUrl('::::')).toBeNull()
	})
})
