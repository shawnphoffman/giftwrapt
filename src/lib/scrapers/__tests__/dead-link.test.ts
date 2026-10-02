import { describe, expect, it } from 'vitest'

import { isDeadLinkRedirect, isHomepagePath } from '../dead-link'

describe('isHomepagePath', () => {
	it('matches site roots, locale roots, and the closed-store password page', () => {
		for (const p of ['/', '/index.html', '/home', '/password', '/en', '/en-us', '/en-US/', '/fr_ca']) {
			expect(isHomepagePath(p), p).toBe(true)
		}
	})

	it('does not match product or collection paths', () => {
		for (const p of ['/products/salt-pig', '/dp/B08996MT43', '/collections/all', '/en-us/products/short', '/account/login']) {
			expect(isHomepagePath(p), p).toBe(false)
		}
	})
})

describe('isDeadLinkRedirect', () => {
	it('flags a product URL that landed on the homepage', () => {
		expect(isDeadLinkRedirect('https://www.emilehenryusa.com/products/salt-pig', 'https://www.emilehenryusa.com/')).toBe(true)
		expect(isDeadLinkRedirect('https://oliclothing.com/en-us/products/pleated-denim-short', 'https://oliclothing.com/en-us')).toBe(true)
		expect(isDeadLinkRedirect('https://colehenry.com/products/striped-long-sleeve-green', 'https://colehenry.com/password')).toBe(true)
		expect(isDeadLinkRedirect('https://a.co/d/0aLV6U0p', 'https://www.amazon.com/')).toBe(true)
	})

	it('does not flag a URL that was already a homepage', () => {
		expect(isDeadLinkRedirect('https://apple.com', 'https://www.apple.com/')).toBe(false)
		expect(isDeadLinkRedirect('https://shop.example.test/?product=123', 'https://shop.example.test/')).toBe(false)
	})

	it('does not flag normal redirects or a missing final URL', () => {
		expect(isDeadLinkRedirect('https://a.co/d/0aLV6U0p', 'https://www.amazon.com/dp/B08996MT43')).toBe(false)
		expect(isDeadLinkRedirect('https://shop.example.test/products/x', 'https://shop.example.test/products/x?variant=1')).toBe(false)
		expect(isDeadLinkRedirect('https://shop.example.test/products/x', undefined)).toBe(false)
	})
})
