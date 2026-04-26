import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { extractFromRaw } from '../index'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = (name: string): string => readFileSync(join(here, '..', '__fixtures__', name), 'utf8')

const FINAL_URL = 'https://www.example.test/products/widget'

describe('extractFromRaw: OG-rich page', () => {
	it('extracts title, description, site name, price, currency, and absolute image URLs', () => {
		const result = extractFromRaw(fixture('og-rich.html'), FINAL_URL)
		expect(result.title).toBe('ACME Widget 2-pack')
		expect(result.description).toBe('A pack of two ACME widgets.')
		expect(result.siteName).toBe('Acme Store')
		expect(result.price).toBe('29.99')
		expect(result.currency).toBe('USD')
		// og:image first, then secure_url, then twitter:image (resolved against FINAL_URL).
		expect(result.imageUrls).toEqual([
			'https://cdn.example.test/widget-1.jpg',
			'https://cdn.example.test/widget-2.jpg',
			'https://www.example.test/relative/twitter-card.jpg',
		])
		expect(result.finalUrl).toBe(FINAL_URL)
	})
})

describe('extractFromRaw: JSON-LD product', () => {
	it('handles @graph wrappers and ImageObject form for image array', () => {
		const result = extractFromRaw(fixture('json-ld-product.html'), FINAL_URL)
		expect(result.title).toBe('JSON-LD Widget')
		expect(result.description).toBe('A widget described via JSON-LD.')
		expect(result.price).toBe('49.5')
		expect(result.currency).toBe('USD')
		expect(result.imageUrls).toEqual(['https://cdn.example.test/json-ld-1.jpg', 'https://cdn.example.test/json-ld-2.jpg'])
	})
})

describe('extractFromRaw: microdata product', () => {
	it('reads itemprop name, description, image, and nested offer price', () => {
		const result = extractFromRaw(fixture('microdata-product.html'), FINAL_URL)
		expect(result.title).toBe('Microdata Widget')
		expect(result.description).toBe('A widget described via microdata.')
		expect(result.price).toBe('9.95')
		expect(result.currency).toBe('GBP')
		expect(result.imageUrls).toEqual(['https://cdn.example.test/microdata-1.jpg'])
	})
})

describe('extractFromRaw: heuristics fallback', () => {
	it('falls back to <title> + meta description and skips 1x1 tracking pixels', () => {
		const result = extractFromRaw(fixture('heuristics-only.html'), FINAL_URL)
		expect(result.title).toBe('Heuristics-only Page')
		expect(result.description).toBe('A page with no OG, JSON-LD, or microdata.')
		// Tracker (1x1) is dropped; main + data-src secondary survive, both
		// resolved against FINAL_URL.
		expect(result.imageUrls).toEqual(['https://www.example.test/imgs/main.jpg', 'https://www.example.test/imgs/secondary.jpg'])
	})

	it('returns no images when only tracking pixels are present', () => {
		const html = `<html><body><img src="t.gif" width="1" height="1" /></body></html>`
		const result = extractFromRaw(html, FINAL_URL)
		expect(result.imageUrls).toEqual([])
	})
})

describe('extractFromRaw: priority ordering and merging', () => {
	it('OG title wins over JSON-LD, microdata, and <title> when all are present', () => {
		const result = extractFromRaw(fixture('combined.html'), FINAL_URL)
		expect(result.title).toBe('OG Title (highest priority)')
		// JSON-LD description wins (no OG description in fixture, but heuristic
		// description exists at lowest priority).
		expect(result.description).toBe('JSON-LD description.')
		// JSON-LD price/currency win (only source).
		expect(result.price).toBe('12.34')
		expect(result.currency).toBe('EUR')
	})

	it('concatenates image URLs across layers and de-duplicates', () => {
		const result = extractFromRaw(fixture('combined.html'), FINAL_URL)
		// OG → JSON-LD → microdata → heuristic, in that order, unique.
		expect(result.imageUrls).toEqual([
			'https://cdn.example.test/og.jpg',
			'https://cdn.example.test/json-ld.jpg',
			'https://cdn.example.test/microdata.jpg',
			'https://cdn.example.test/heuristic.jpg',
		])
	})

	it('always returns finalUrl in the result', () => {
		const result = extractFromRaw('<html><head></head><body></body></html>', FINAL_URL)
		expect(result.finalUrl).toBe(FINAL_URL)
		expect(result.imageUrls).toEqual([])
	})
})

describe('extractFromRaw: defensive handling', () => {
	it('ignores malformed JSON-LD and continues with other parsers', () => {
		const html = `
			<html>
				<head>
					<title>Fallback Title</title>
					<script type="application/ld+json">{ this is not json }</script>
				</head>
				<body></body>
			</html>
		`
		const result = extractFromRaw(html, FINAL_URL)
		expect(result.title).toBe('Fallback Title')
	})

	it('handles empty HTML without throwing', () => {
		const result = extractFromRaw('', FINAL_URL)
		expect(result.imageUrls).toEqual([])
		expect(result.title).toBeUndefined()
	})
})
