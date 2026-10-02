import { describe, expect, it } from 'vitest'

import { amazonAsin, isSameProduct } from '../same-product'
import type { ScrapeResult } from '../types'

const r = (title: string, finalUrl = 'https://shop.example.test/p/1'): ScrapeResult => ({ title, finalUrl, imageUrls: [] })

describe('amazonAsin', () => {
	it('reads the ASIN from the common Amazon product paths', () => {
		expect(amazonAsin('https://www.amazon.com/dp/B08996MT43')).toBe('B08996MT43')
		expect(amazonAsin('https://www.amazon.com/gp/product/B0B94MF4LP?th=1')).toBe('B0B94MF4LP')
		expect(amazonAsin('https://www.amazon.com/Anker-PowerCore/dp/B099284SRR/ref=sr_1_1')).toBe('B099284SRR')
		expect(amazonAsin('https://www.amazon.com/gp/aw/d/b08996mt43')).toBe('B08996MT43')
	})

	it('returns undefined without an ASIN', () => {
		expect(amazonAsin('https://shop.example.test/products/widget')).toBeUndefined()
		expect(amazonAsin(undefined)).toBeUndefined()
	})
})

describe('isSameProduct', () => {
	it('accepts identical and near-identical titles', () => {
		expect(isSameProduct(r('ACME Widget 2-pack'), r('ACME Widget 2-pack'))).toEqual({ ok: true })
		expect(
			isSameProduct(r('Amazon.com: Seagate IronWolf Pro, 20 TB, Enterprise NAS'), r('Seagate IronWolf Pro, 20 TB, Enterprise NAS'))
		).toEqual({
			ok: true,
		})
	})

	it('accepts a terse title contained in the full listing title', () => {
		const full = r('Seagate IronWolf Pro, 20 TB, Enterprise NAS Internal HDD CMR 3.5 Inch SATA 6Gb/s 7200 RPM 256 MB Cache')
		expect(isSameProduct(full, r('Seagate IronWolf Pro 20 TB'))).toEqual({ ok: true })
	})

	it('rejects a captcha page title', () => {
		const product = r('Seagate IronWolf Pro, 20 TB, Enterprise NAS Internal HDD', 'https://www.amazon.com/dp/B0B94MF4LP')
		expect(isSameProduct(product, r('Amazon.com', 'https://www.amazon.com/dp/B0B94MF4LP'))).toEqual({ ok: false, reason: 'title-mismatch' })
	})

	it('rejects a different product', () => {
		expect(isSameProduct(r('ACME Widget 2-pack'), r('Bread Pot Sourdough and No-Knead Bread Baker'))).toEqual({
			ok: false,
			reason: 'title-mismatch',
		})
	})

	it('rejects a different Amazon ASIN even when the titles match', () => {
		expect(
			isSameProduct(
				r('ACME Widget 2-pack', 'https://www.amazon.com/dp/B000000001'),
				r('ACME Widget 2-pack', 'https://www.amazon.com/dp/B000000002')
			)
		).toEqual({ ok: false, reason: 'different-asin' })
	})
})
