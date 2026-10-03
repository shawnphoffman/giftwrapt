import { describe, expect, it } from 'vitest'

import { buildSearchUrl, isValidSearchUrlTemplate } from '../search-url'

describe('isValidSearchUrlTemplate', () => {
	it('accepts an http(s) URL with a {query} placeholder anywhere', () => {
		expect(isValidSearchUrlTemplate('https://www.google.com/search?q={query}')).toBe(true)
		expect(isValidSearchUrlTemplate('https://shop.example/s/{query}/results')).toBe(true)
		expect(isValidSearchUrlTemplate('http://intranet.local/find?q={query}')).toBe(true)
	})

	it('rejects a template without the placeholder', () => {
		expect(isValidSearchUrlTemplate('https://www.google.com/search?q=')).toBe(false)
	})

	it('rejects anything that is not a web link', () => {
		expect(isValidSearchUrlTemplate('javascript:alert({query})')).toBe(false)
		expect(isValidSearchUrlTemplate('data:text/html,{query}')).toBe(false)
		expect(isValidSearchUrlTemplate('not a url {query}')).toBe(false)
	})

	it('rejects an overly long template', () => {
		expect(isValidSearchUrlTemplate(`https://example.com/?q={query}&pad=${'x'.repeat(500)}`)).toBe(false)
	})
})

describe('buildSearchUrl', () => {
	it('fills in the encoded title', () => {
		expect(buildSearchUrl('https://www.google.com/search?q={query}', '  Cashmere knit beanie & scarf ')).toBe(
			'https://www.google.com/search?q=Cashmere%20knit%20beanie%20%26%20scarf'
		)
	})

	it('replaces every placeholder', () => {
		expect(buildSearchUrl('https://a.example/{query}?q={query}', 'mug')).toBe('https://a.example/mug?q=mug')
	})

	it('returns null when there is no usable template', () => {
		expect(buildSearchUrl(null, 'mug')).toBeNull()
		expect(buildSearchUrl('', 'mug')).toBeNull()
		expect(buildSearchUrl('javascript:{query}', 'mug')).toBeNull()
	})
})
