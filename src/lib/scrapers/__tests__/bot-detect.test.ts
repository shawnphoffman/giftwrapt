import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { looksLikeBlocked } from '../bot-detect'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = (name: string): string => readFileSync(join(here, '..', 'extractor', '__fixtures__', name), 'utf8')

describe('looksLikeBlocked', () => {
	it('flags the Amazon captcha interstitial', () => {
		expect(looksLikeBlocked(fixture('amazon-captcha.html'))).toBe(true)
	})

	it('does not flag real Amazon product pages', () => {
		expect(looksLikeBlocked(fixture('amazon-product.html'))).toBe(false)
		expect(looksLikeBlocked(fixture('amazon-crawler.html'))).toBe(false)
	})

	it('flags the Akamai edge "Access Denied" page', () => {
		expect(looksLikeBlocked(fixture('akamai-edge-access-denied.html'))).toBe(true)
	})

	it('flags the Akamai edge page by its reference line when the request URL is long', () => {
		const longUrl = `https://www.example.com/p/${'a'.repeat(1500)}`
		const html = `<html><head>\n<title>Access Denied</title>\n</head><body>\n<h1>Access Denied</h1>\nYou don't have permission to access "${longUrl}" on this server.<p>\nReference #18.42d3e17.1792092966.9e3bec7\n</p></body></html>`
		expect(looksLikeBlocked(html)).toBe(true)
	})

	it('flags the BLOCKED_EDGE block page at its real size', () => {
		// The live page carries a ~10KB inline logo; the fixture stubs it out.
		const html = fixture('edge-blocked-access-denied.html').replace('base64,iVBORw0KGgo=', `base64,${'A'.repeat(9800)}`)
		expect(html.length).toBeGreaterThan(11_000)
		expect(looksLikeBlocked(html)).toBe(true)
	})

	it('flags the DataDome interstitial and captcha pages', () => {
		expect(looksLikeBlocked(fixture('datadome-interstitial.html'))).toBe(true)
		expect(looksLikeBlocked(fixture('datadome-captcha.html'))).toBe(true)
	})

	it('flags a DataDome page by its inline config alone', () => {
		// The raw form the live page serves (the fixture is Prettier-formatted).
		const html =
			"<html><head><title>shop.example.com</title></head><body><script data-cfasync=\"false\">var dd={'rt':'c','cid':'x==','host':'geo.captcha-delivery.com'}</script></body></html>"
		expect(looksLikeBlocked(html)).toBe(true)
	})

	it('does not flag a real page from a DataDome-protected store', () => {
		const html =
			'<html><head><title>Thermal Top | Shop</title><script src="https://js.datadome.co/tags.js" async></script></head>' +
			'<body><h1>Thermal Top</h1><script>window.__STATE__={"datadome":{"challengeActive":false},"DATADOME_JS_KEY":"ABC123"}</script></body></html>'
		expect(looksLikeBlocked(html)).toBe(false)
	})

	it('flags a Cloudflare challenge', () => {
		expect(looksLikeBlocked('<html><head><title>Just a moment...</title></head><body>cf-browser-verification</body></html>')).toBe(true)
	})
})
