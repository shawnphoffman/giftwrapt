import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { isAmazonUrl } from '../amazon'
import { extractFromRaw, tidyPrice } from '../index'

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
		// JSON-LD `49.5` is padded to two decimals for the form.
		expect(result.price).toBe('49.50')
		expect(result.currency).toBe('USD')
		expect(result.imageUrls).toEqual(['https://cdn.example.test/json-ld-1.jpg', 'https://cdn.example.test/json-ld-2.jpg'])
	})

	it('parses aggregateRating and normalizes against bestRating', () => {
		const result = extractFromRaw(fixture('json-ld-product.html'), FINAL_URL)
		// 4.2 / 5 = 0.84
		expect(result.ratingValue).toBeCloseTo(0.84, 5)
		expect(result.ratingCount).toBe(128)
	})

	it('defaults bestRating to 5 when omitted', () => {
		const html = `
			<html><head><script type="application/ld+json">
				${JSON.stringify({
					'@context': 'https://schema.org',
					'@type': 'Product',
					name: 'No-bestRating Widget',
					aggregateRating: { '@type': 'AggregateRating', ratingValue: 4, ratingCount: 10 },
				})}
			</script></head><body></body></html>
		`
		const result = extractFromRaw(html, FINAL_URL)
		expect(result.ratingValue).toBeCloseTo(0.8, 5)
		expect(result.ratingCount).toBe(10)
	})

	it('falls back to reviewCount when ratingCount is absent', () => {
		const html = `
			<html><head><script type="application/ld+json">
				${JSON.stringify({
					'@context': 'https://schema.org',
					'@type': 'Product',
					name: 'reviewCount fallback',
					aggregateRating: { ratingValue: 5, bestRating: 5, reviewCount: 7 },
				})}
			</script></head><body></body></html>
		`
		const result = extractFromRaw(html, FINAL_URL)
		expect(result.ratingValue).toBe(1)
		expect(result.ratingCount).toBe(7)
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

	it('parses nested aggregateRating scope and normalizes', () => {
		const result = extractFromRaw(fixture('microdata-product.html'), FINAL_URL)
		// 3.5 / 5 = 0.7
		expect(result.ratingValue).toBeCloseTo(0.7, 5)
		expect(result.ratingCount).toBe(42)
	})
})

describe('extractFromRaw: Amazon-style markup', () => {
	it('reads "X out of Y stars" from a-icon-alt and the acrCustomerReviewText count', () => {
		const result = extractFromRaw(fixture('amazon-style.html'), FINAL_URL)
		// 4.6 / 5 = 0.92
		expect(result.ratingValue).toBeCloseTo(0.92, 5)
		expect(result.ratingCount).toBe(2847)
	})

	it('falls back to the a-star-X-Y class when no a-icon-alt text is present', () => {
		const html = `
			<html><body>
				<i class="a-icon a-icon-star a-star-3-5"></i>
			</body></html>
		`
		const result = extractFromRaw(html, FINAL_URL)
		// 3.5 / 5 = 0.7
		expect(result.ratingValue).toBeCloseTo(0.7, 5)
	})

	it('reads rating-out-of-text data-hook on reviews pages', () => {
		const html = `
			<html><body>
				<span data-hook="rating-out-of-text">4.0 out of 5</span>
				<span data-hook="total-review-count">1,000 ratings</span>
			</body></html>
		`
		const result = extractFromRaw(html, FINAL_URL)
		expect(result.ratingValue).toBeCloseTo(0.8, 5)
		expect(result.ratingCount).toBe(1000)
	})
})

describe('extractFromRaw: Amazon product pages', () => {
	const AMAZON_URL = 'https://www.amazon.com/dp/B08996MT43'

	it('reads the price to pay, not the struck-out list price', () => {
		const result = extractFromRaw(fixture('amazon-product.html'), AMAZON_URL)
		expect(result.price).toBe('79.99')
		expect(result.currency).toBe('USD')
	})

	it('uses #productTitle instead of the "Amazon.com:"-prefixed <title>', () => {
		const result = extractFromRaw(fixture('amazon-product.html'), AMAZON_URL)
		expect(result.title).toBe('AMAGABELI GARDEN & HOME 31in Large Firewood Rack')
	})

	it('puts the hi-res hero first, then full-size gallery photos, and drops junk', () => {
		const result = extractFromRaw(fixture('amazon-product.html'), AMAZON_URL)
		expect(result.imageUrls.slice(0, 3)).toEqual([
			'https://m.media-amazon.com/images/I/816A65vK6cL._AC_SL1500_.jpg',
			'https://m.media-amazon.com/images/I/51O4p1hbPeL._AC_SL1500_.jpg',
			'https://m.media-amazon.com/images/I/411t+mlB3qL._AC_SL1500_.jpg',
		])
		// The hero's own gallery thumbnail is not repeated, the video
		// thumbnail is skipped, and neither the data: placeholder nor the
		// /images/G/ site graphic survives.
		expect(result.imageUrls.filter(u => u.includes('816A65vK6cL._AC_SL1500_'))).toHaveLength(1)
		expect(result.imageUrls.some(u => u.includes('PKplay'))).toBe(false)
		expect(result.imageUrls.some(u => u.startsWith('data:'))).toBe(false)
		expect(result.imageUrls.some(u => u.includes('/images/G/'))).toBe(false)
	})

	it('still reads the rating through the generic Amazon heuristics', () => {
		const result = extractFromRaw(fixture('amazon-product.html'), AMAZON_URL)
		expect(result.ratingValue).toBeCloseTo(0.96, 5)
		expect(result.ratingCount).toBe(1013)
	})

	it('folds the og:image share card into the hero on the crawler page, with no price', () => {
		const result = extractFromRaw(fixture('amazon-crawler.html'), AMAZON_URL)
		expect(result.price).toBeUndefined()
		expect(result.title).toBe('AMAGABELI GARDEN & HOME 31in Large Firewood Rack')
		// The share card and the 300px src are the same asset as the hero,
		// so only the hero survives.
		expect(result.imageUrls).toEqual([
			'https://m.media-amazon.com/images/I/816A65vK6cL._AC_SL1500_.jpg',
			'https://m.media-amazon.com/images/I/51O4p1hbPeL._AC_SL1500_.jpg',
		])
	})

	it('keeps the share card when it is the only copy of the photo', () => {
		const html = fixture('amazon-crawler.html').replace(/<img[\s\S]*?id="landingImage"\s*\/>/, '')
		const result = extractFromRaw(html, AMAZON_URL)
		expect(result.imageUrls[0]).toContain('816A65vK6cL.jpg_BO30')
	})

	it('falls back to the largest data-a-dynamic-image entry without data-old-hires', () => {
		const html = `<html><body><img id="landingImage" data-a-dynamic-image='{"https://m.media-amazon.com/images/I/abc._AC_SX355_.jpg":[334,355],"https://m.media-amazon.com/images/I/abc._AC_SX679_.jpg":[640,679]}' /></body></html>`
		const result = extractFromRaw(html, AMAZON_URL)
		expect(result.imageUrls[0]).toBe('https://m.media-amazon.com/images/I/abc._AC_SX679_.jpg')
	})

	it('falls back to the hidden price inputs when the price block is absent', () => {
		const html = `<html><body><input id="priceSymbol" value="$" /><input id="priceValue" value="24.50" /></body></html>`
		const result = extractFromRaw(html, AMAZON_URL)
		expect(result.price).toBe('24.50')
		expect(result.currency).toBe('USD')
	})

	it('ignores Amazon markup on other hosts', () => {
		const result = extractFromRaw(fixture('amazon-product.html'), FINAL_URL)
		expect(result.title).toMatch(/^Amazon\.com: /)
		expect(result.imageUrls[0]).not.toBe('https://m.media-amazon.com/images/I/816A65vK6cL._AC_SL1500_.jpg')
	})
})

describe('isAmazonUrl', () => {
	it('matches Amazon storefronts and short links', () => {
		for (const url of [
			'https://www.amazon.com/dp/B08996MT43',
			'https://amazon.com/gp/product/B08996MT43',
			'https://smile.amazon.co.uk/dp/X',
			'https://www.amazon.co.jp/dp/X',
			'https://www.amazon.com.au/dp/X',
			'https://a.co/d/0aLV6U0p',
			'https://amzn.to/3abc',
		]) {
			expect(isAmazonUrl(url), url).toBe(true)
		}
	})

	it('rejects lookalikes and non-URLs', () => {
		for (const url of ['https://notamazon.com/x', 'https://amazon.com.evil.test/x', 'https://www.example.test/amazon.com', 'not a url']) {
			expect(isAmazonUrl(url), url).toBe(false)
		}
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

	it('prefers data-src over a data: lazy-load placeholder in src', () => {
		const html = `<html><body><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-src="/imgs/real.jpg" /></body></html>`
		const result = extractFromRaw(html, FINAL_URL)
		expect(result.imageUrls).toEqual(['https://www.example.test/imgs/real.jpg'])
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

describe('extractFromRaw: price source', () => {
	it('prefers the JSON-LD offer over a stale og:price, with currency from the same layer', () => {
		const html = `<html><head>
			<meta property="og:price:amount" content="90" />
			<meta property="og:price:currency" content="CAD" />
			<script type="application/ld+json">${JSON.stringify({
				'@context': 'https://schema.org',
				'@type': 'Product',
				name: 'Barbie Signature Stevie Nicks',
				offers: { '@type': 'Offer', price: '59.40', priceCurrency: 'USD' },
			})}</script>
		</head><body></body></html>`
		const result = extractFromRaw(html, FINAL_URL)
		expect(result.price).toBe('59.40')
		expect(result.currency).toBe('USD')
	})

	it('falls back to another layer for currency when the price layer has none', () => {
		const html = `<html><head>
			<meta property="og:price:currency" content="EUR" />
			<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Widget', offers: { price: 12 } })}</script>
		</head><body></body></html>`
		const result = extractFromRaw(html, FINAL_URL)
		expect(result.price).toBe('12')
		expect(result.currency).toBe('EUR')
	})

	it('ignores prices inside collection grids and product cards', () => {
		const html = `<html><head><title>Official Store | Cookware</title></head><body class="template-index">
			<div class="collection__grid-loop featured__collection-carousel">
				<div class="product-index" data-price="14995"><div class="price price--listing">$149.95</div></div>
			</div>
			<div class="product-recommendations"><span class="price">$12.00</span></div>
		</body></html>`
		expect(extractFromRaw(html, FINAL_URL).price).toBeUndefined()
	})

	it('still reads the main product price outside those containers', () => {
		const html = `<html><body>
			<div class="product__info-container"><div class="price price--large"><span class="price-item">$85.00</span></div></div>
			<div class="related-products"><span class="price">$12.00</span></div>
		</body></html>`
		expect(extractFromRaw(html, FINAL_URL).price).toBe('85.00')
	})
})

describe('tidyPrice', () => {
	it('drops thousands separators and pads a single decimal', () => {
		expect(tidyPrice('2,100.00')).toBe('2100.00')
		expect(tidyPrice('169.0')).toBe('169.00')
		expect(tidyPrice('24.5')).toBe('24.50')
	})

	it('never rounds or touches anything else', () => {
		expect(tidyPrice('55')).toBe('55')
		expect(tidyPrice('19.999')).toBe('19.999')
		expect(tidyPrice('29,99')).toBe('29,99')
	})
})
