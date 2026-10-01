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

	it('flags a Cloudflare challenge', () => {
		expect(looksLikeBlocked('<html><head><title>Just a moment...</title></head><body>cf-browser-verification</body></html>')).toBe(true)
	})
})
