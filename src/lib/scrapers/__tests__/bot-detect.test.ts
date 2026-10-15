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

	it('flags a Cloudflare challenge', () => {
		expect(looksLikeBlocked('<html><head><title>Just a moment...</title></head><body>cf-browser-verification</body></html>')).toBe(true)
	})
})
