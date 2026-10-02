import { describe, expect, it } from 'vitest'

import { CACHE_MIN_SCORE, QUALITY_THRESHOLD, scoreBreakdown, scoreScrape } from '../score'
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
	it('awards +3 for a real product photo', () => {
		const score = scoreScrape({ imageUrls: ['https://cdn.example.test/widget.jpg'] })
		expect(score).toBe(3)
	})

	it('awards +1 when the only photo is an Amazon share card', () => {
		const shareCard =
			'https://m.media-amazon.com/images/I/816A65vK6cL.jpg_BO30,255,255,255_UF800,800_SR860,800,1,L_SR1910,1000,0,R_PI2026-pbdd-socialshare-awareness-en-US-d-nondeal,TopLeft,0,0_QL100_.jpg'
		expect(scoreScrape({ imageUrls: [shareCard] })).toBe(1)
	})

	it('awards 0 when every image is a thumbnail', () => {
		expect(scoreScrape({ imageUrls: ['https://m.media-amazon.com/images/I/41-BcmX4J7L._AC_US40_.jpg'] })).toBe(0)
		expect(scoreScrape({ imageUrls: ['https://cdn.example.test/widget.jpg?w=100'] })).toBe(0)
	})

	it('uses the best image, not the first', () => {
		const score = scoreScrape({
			imageUrls: [
				'https://m.media-amazon.com/images/I/41-BcmX4J7L._AC_US40_.jpg',
				'https://m.media-amazon.com/images/I/816A65vK6cL._AC_SL1500_.jpg',
			],
		})
		expect(score).toBe(3)
	})

	it('ignores data: placeholders', () => {
		expect(scoreScrape({ imageUrls: ['data:image/gif;base64,R0lGODlhAQABAAAAACw='] })).toBe(0)
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
	it('+3 for a non-empty price', () => {
		expect(scoreScrape({ ...empty, price: '9.99' })).toBe(3)
		expect(scoreScrape({ ...empty, price: '   ' })).toBe(0)
	})

	it('+1 for a description over 30 characters', () => {
		const long = 'A useful and very specifically described product description.'
		expect(scoreScrape({ ...empty, description: long })).toBe(1)
		expect(scoreScrape({ ...empty, description: 'short' })).toBe(0)
	})
})

describe('scoreScrape: error-title penalty', () => {
	it('penalises "Page Not Found" titles below threshold even with full data', () => {
		const result: ScrapeResult = {
			title: 'Page Not Found - New Balance',
			description: 'Sorry, the page you are looking for could not be found.',
			price: '48.99',
			imageUrls: ['https://cdn.example.test/flag.jpg'],
			finalUrl: 'https://www.newbalance.com/pd/missing.html',
		}
		// Without the rule: title(2) + image(2) + price(1) + desc(1) = 6.
		// With the rule: no title bonus (-2 missed) and -3 penalty -> 1.
		const score = scoreScrape(result)
		expect(score).toBeLessThan(QUALITY_THRESHOLD)
	})

	it('catches numeric error-status titles like "404 - Page Not Found"', () => {
		expect(scoreScrape({ ...empty, title: '404 - Page Not Found' })).toBeLessThan(0)
	})

	it('catches Cloudflare interstitial title "Just a moment..."', () => {
		expect(scoreScrape({ ...empty, title: 'Just a moment...' })).toBeLessThan(0)
	})

	it('catches "Access Denied" and maintenance pages', () => {
		expect(scoreScrape({ ...empty, title: 'Access Denied' })).toBeLessThan(0)
		expect(scoreScrape({ ...empty, title: 'Site under maintenance' })).toBeLessThan(0)
	})

	it('does not penalise legitimate product titles', () => {
		expect(scoreScrape({ ...empty, title: 'ACME Widget 2-pack' })).toBe(2)
	})
})

describe('scoreScrape: bot/login wall penalty', () => {
	it('subtracts 3 when the HTML matches a Cloudflare wall pattern', () => {
		const result = { ...empty, title: 'A real product page' }
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
		expect(score).toBe(9)
	})

	it('scores a sparse result below the threshold', () => {
		const result: ScrapeResult = { title: 'A title only', imageUrls: [] }
		expect(scoreScrape(result)).toBeLessThan(QUALITY_THRESHOLD)
	})
})

describe('scoreScrape: stop rule (price and a real photo are required)', () => {
	const title = 'ACME Widget 2-pack'
	const description = 'A pack of two ACME widgets, suitable for all occasions.'
	const photo = 'https://cdn.example.test/widget.jpg'
	const shareCard = 'https://m.media-amazon.com/images/I/816A65vK6cL.jpg_BO30,255,255,255_UF800,800_SR1910,1000,0,C_QL100_.jpg'

	it('clears with a title, price, and real photo', () => {
		expect(scoreScrape({ title, price: '29.99', imageUrls: [photo] })).toBe(QUALITY_THRESHOLD)
	})

	it('falls through without a price, even with a photo and description', () => {
		expect(scoreScrape({ title, description, imageUrls: [photo] })).toBeLessThan(QUALITY_THRESHOLD)
	})

	it('falls through without a real photo, even with a price, share card, and description', () => {
		expect(scoreScrape({ title, description, price: '29.99', imageUrls: [shareCard] })).toBeLessThan(QUALITY_THRESHOLD)
	})

	it('still caches a title plus a real photo, or a title plus a price', () => {
		expect(scoreScrape({ title, imageUrls: [photo] })).toBeGreaterThanOrEqual(CACHE_MIN_SCORE)
		expect(scoreScrape({ title, price: '29.99', imageUrls: [] })).toBeGreaterThanOrEqual(CACHE_MIN_SCORE)
		expect(scoreScrape({ title, imageUrls: [shareCard] })).toBeLessThan(CACHE_MIN_SCORE)
	})
})

describe('scoreBreakdown', () => {
	it('itemizes every signal and sums to the score', () => {
		const result: ScrapeResult = {
			title: 'A real product page',
			price: '9.99',
			imageUrls: ['https://cdn.example.test/widget.jpg'],
			description: 'A useful and very specifically described product description.',
		}
		const html = '<html><head><title>Just a moment...</title></head><body>cf-browser-verification</body></html>'
		const breakdown = scoreBreakdown(result, { html })
		expect(breakdown.parts).toEqual([
			{ signal: 'title', points: 2 },
			{ signal: 'price', points: 3 },
			{ signal: 'photo', points: 3 },
			{ signal: 'description', points: 1 },
			{ signal: 'botWall', points: -3 },
		])
		expect(breakdown.total).toBe(6)
		expect(scoreScrape(result, { html })).toBe(breakdown.total)
	})

	it('returns no parts for an empty result', () => {
		expect(scoreBreakdown(empty)).toEqual({ total: 0, parts: [] })
	})
})
