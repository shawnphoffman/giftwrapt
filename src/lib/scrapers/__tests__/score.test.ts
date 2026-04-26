import { describe, expect, it } from 'vitest'

import { QUALITY_THRESHOLD, scoreScrape } from '../score'
import type { ScrapeResult } from '../types'

const empty: ScrapeResult = { imageUrls: [] }

describe('scoreScrape: title rule', () => {
	it('awards +2 for a meaningful title', () => {
		const score = scoreScrape({ ...empty, title: 'ACME Widget 2-pack' })
		expect(score).toBe(2)
	})

	it('awards 0 when title is missing or empty', () => {
		expect(scoreScrape(empty)).toBe(0)
		expect(scoreScrape({ ...empty, title: '' })).toBe(0)
		expect(scoreScrape({ ...empty, title: '   ' })).toBe(0)
	})

	it('awards 0 when title equals the page hostname', () => {
		const result = { ...empty, title: 'www.example.test', finalUrl: 'https://www.example.test/foo' }
		expect(scoreScrape(result)).toBe(0)
	})

	it('handles bare hostname without www', () => {
		const result = { ...empty, title: 'example.test', finalUrl: 'https://www.example.test/foo' }
		expect(scoreScrape(result)).toBe(0)
	})
})

describe('scoreScrape: image rule', () => {
	it('awards +2 when at least one image is present and not a tracker', () => {
		const score = scoreScrape({ imageUrls: ['https://cdn.example.test/widget.jpg'] })
		expect(score).toBe(2)
	})

	it('awards 0 when imageUrls is empty', () => {
		expect(scoreScrape(empty)).toBe(0)
	})

	it('awards 0 when every image is a tracking pixel or tracker domain', () => {
		const score = scoreScrape({ imageUrls: ['https://doubleclick.net/foo.gif', 'https://x.test/foo_1x1.gif'] })
		expect(score).toBe(0)
	})
})

describe('scoreScrape: price + description rules', () => {
	it('+1 for a non-empty price', () => {
		expect(scoreScrape({ ...empty, price: '9.99' })).toBe(1)
		expect(scoreScrape({ ...empty, price: '   ' })).toBe(0)
	})

	it('+1 for a description over 30 characters', () => {
		const long = 'A useful and very specifically described product description.'
		expect(scoreScrape({ ...empty, description: long })).toBe(1)
		expect(scoreScrape({ ...empty, description: 'short' })).toBe(0)
	})
})

describe('scoreScrape: bot/login wall penalty', () => {
	it('subtracts 3 when the HTML matches a Cloudflare wall pattern', () => {
		const result = { ...empty, title: 'Just a moment...' }
		const html = '<html><head><title>Just a moment...</title></head><body>cf-browser-verification</body></html>'
		// Title is meaningful (not the hostname) → +2; bot wall → -3 → net -1.
		expect(scoreScrape(result, { html })).toBe(-1)
	})

	it('does not penalise when no wall signature is present', () => {
		const result = { ...empty, title: 'A real product page' }
		const html = '<html><body>actual content</body></html>'
		expect(scoreScrape(result, { html })).toBe(2)
	})
})

describe('scoreScrape: combined cases', () => {
	it('scores a fully-populated result above the threshold', () => {
		const result: ScrapeResult = {
			title: 'ACME Widget 2-pack',
			description: 'A pack of two ACME widgets, suitable for all occasions.',
			price: '29.99',
			imageUrls: ['https://cdn.example.test/widget.jpg'],
			finalUrl: 'https://acme.test/products/widget',
		}
		const score = scoreScrape(result)
		expect(score).toBeGreaterThanOrEqual(QUALITY_THRESHOLD)
		expect(score).toBe(6)
	})

	it('scores a sparse result below the threshold', () => {
		const result: ScrapeResult = { title: 'A title only', imageUrls: [] }
		expect(scoreScrape(result)).toBeLessThan(QUALITY_THRESHOLD)
	})
})
