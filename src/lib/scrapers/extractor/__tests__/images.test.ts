import { describe, expect, it } from 'vitest'

import { bestImageClass, classifyImageUrl, filterAndSortImages, looksLikeTrackingPixel } from '../images'

describe('looksLikeTrackingPixel', () => {
	it('catches well-known tracker hostnames', () => {
		expect(looksLikeTrackingPixel('https://doubleclick.net/x.gif')).toBe(true)
		expect(looksLikeTrackingPixel('https://www.facebook.com/tr?id=123')).toBe(true)
		expect(looksLikeTrackingPixel('https://b.scorecardresearch.com/p?c1=2')).toBe(true)
	})

	it('catches 1x1 sizing in URLs', () => {
		expect(looksLikeTrackingPixel('https://cdn.example.test/img.gif?w=1&h=1')).toBe(true)
		expect(looksLikeTrackingPixel('https://cdn.example.test/img_1x1.png')).toBe(true)
	})

	it('catches sentinel pixel basenames regardless of extension', () => {
		expect(looksLikeTrackingPixel('https://cdn.example.test/static/pixel.png')).toBe(true)
		expect(looksLikeTrackingPixel('https://cdn.example.test/img/spacer.gif')).toBe(true)
		expect(looksLikeTrackingPixel('https://cdn.example.test/blank.gif')).toBe(true)
		expect(looksLikeTrackingPixel('https://cdn.example.test/transparent.png')).toBe(true)
		expect(looksLikeTrackingPixel('https://cdn.example.test/1x1.jpg')).toBe(true)
	})

	it('catches tracker path segments', () => {
		expect(looksLikeTrackingPixel('https://example.test/track/event.gif')).toBe(true)
		expect(looksLikeTrackingPixel('https://example.test/beacon/?id=42')).toBe(true)
		expect(looksLikeTrackingPixel('https://example.test/collect?u=foo')).toBe(true)
	})

	it('catches additional analytics tracker hostnames', () => {
		expect(looksLikeTrackingPixel('https://api.segment.io/v1/p?abc=1')).toBe(true)
		expect(looksLikeTrackingPixel('https://bat.bing.com/action/0?ti=1')).toBe(true)
	})

	it('passes real product image URLs through', () => {
		expect(looksLikeTrackingPixel('https://cdn.example.test/products/widget.jpg')).toBe(false)
		expect(looksLikeTrackingPixel('https://images.example.test/widget?w=600')).toBe(false)
		// Real product paths that contain pixel-like words but aren't sentinel basenames.
		expect(looksLikeTrackingPixel('https://cdn.example.test/products/blank-tshirt.jpg')).toBe(false)
		expect(looksLikeTrackingPixel('https://cdn.example.test/img/spacer-fitted-cap.png')).toBe(false)
	})
})

describe('filterAndSortImages: filtering', () => {
	it('drops trackers, logos, sprites, icons, and SVG', () => {
		const survivors = filterAndSortImages([
			'https://cdn.example.test/products/widget.jpg',
			'https://doubleclick.net/pixel.gif',
			'https://cdn.example.test/logo.png',
			'https://cdn.example.test/sprites/checkout.png',
			'https://cdn.example.test/icons/cart.svg',
			'https://cdn.example.test/banner.svg',
			'https://cdn.example.test/animation.gif',
			'https://cdn.example.test/products/widget-back.png',
		])
		expect(survivors).toEqual(['https://cdn.example.test/products/widget.jpg', 'https://cdn.example.test/products/widget-back.png'])
	})

	it('drops data:, blob:, and javascript: URLs', () => {
		const survivors = filterAndSortImages([
			'data:image/jpeg;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
			'blob:https://www.example.test/1234',
			'javascript:void(0)',
			'https://cdn.example.test/products/widget.jpg',
		])
		expect(survivors).toEqual(['https://cdn.example.test/products/widget.jpg'])
	})

	it('drops Amazon /images/G/ site graphics but keeps /images/I/ product photos', () => {
		const survivors = filterAndSortImages([
			'https://m.media-amazon.com/images/G/01/product_insurance/images/warranty-short-bullet-point-coverage._CB630304460_.png',
			'https://images-na.ssl-images-amazon.com/images/G/01/consumerelectronics/banner.jpg',
			'https://m.media-amazon.com/images/I/816A65vK6cL._AC_SL1500_.jpg',
			'https://cdn.example.test/images/G/not-amazon.jpg',
		])
		expect(survivors).toEqual([
			'https://m.media-amazon.com/images/I/816A65vK6cL._AC_SL1500_.jpg',
			'https://cdn.example.test/images/G/not-amazon.jpg',
		])
	})

	it('collapses Amazon size and overlay variants of one asset to the first seen', () => {
		const survivors = filterAndSortImages([
			'https://m.media-amazon.com/images/I/816A65vK6cL._AC_SL1500_.jpg',
			'https://m.media-amazon.com/images/I/816A65vK6cL.jpg_BO30,255,255,255_UF800,800_SR1910,1000,0,C_QL100_.jpg',
			'https://m.media-amazon.com/images/I/816A65vK6cL._AC_US100_.jpg',
			'https://m.media-amazon.com/images/I/51O4p1hbPeL._AC_US100_.jpg',
			'https://m.media-amazon.com/images/I/91WLxeTraCL.SS125_PKplay-button-mb-image-grid-small_.jpg',
		])
		expect(survivors).toEqual([
			'https://m.media-amazon.com/images/I/816A65vK6cL._AC_SL1500_.jpg',
			'https://m.media-amazon.com/images/I/51O4p1hbPeL._AC_US100_.jpg',
		])
	})

	it('preserves source order for non-variants', () => {
		const survivors = filterAndSortImages(['https://a.test/1.jpg', 'https://a.test/2.jpg', 'https://a.test/3.jpg'])
		expect(survivors).toEqual(['https://a.test/1.jpg', 'https://a.test/2.jpg', 'https://a.test/3.jpg'])
	})

	it('de-dupes exact duplicates while preserving the first occurrence', () => {
		const survivors = filterAndSortImages(['https://a.test/x.jpg', 'https://a.test/y.jpg', 'https://a.test/x.jpg'])
		expect(survivors).toEqual(['https://a.test/x.jpg', 'https://a.test/y.jpg'])
	})

	it('keeps unknown extensions when path has no extension at all', () => {
		const survivors = filterAndSortImages(['https://images.example.test/12345?w=600'])
		expect(survivors).toEqual(['https://images.example.test/12345?w=600'])
	})
})

describe('filterAndSortImages: size-variant collapse', () => {
	it('chooses the @2x variant over the base file', () => {
		const survivors = filterAndSortImages(['https://cdn.example.test/widget.jpg', 'https://cdn.example.test/widget@2x.jpg'])
		expect(survivors).toEqual(['https://cdn.example.test/widget@2x.jpg'])
	})

	it('chooses the _large variant over the base file', () => {
		const survivors = filterAndSortImages(['https://cdn.example.test/widget.jpg', 'https://cdn.example.test/widget_large.jpg'])
		expect(survivors).toEqual(['https://cdn.example.test/widget_large.jpg'])
	})

	it('chooses the larger ?w= variant of the same asset', () => {
		const survivors = filterAndSortImages([
			'https://images.example.test/widget?w=300',
			'https://images.example.test/widget?w=600',
			'https://images.example.test/widget?w=200',
		])
		expect(survivors).toEqual(['https://images.example.test/widget?w=600'])
	})

	it('keeps distinct assets even when they share a directory', () => {
		const survivors = filterAndSortImages([
			'https://cdn.example.test/products/widget-front.jpg',
			'https://cdn.example.test/products/widget-back.jpg',
		])
		expect(survivors).toEqual(['https://cdn.example.test/products/widget-front.jpg', 'https://cdn.example.test/products/widget-back.jpg'])
	})
})

describe('classifyImageUrl', () => {
	it('classifies Amazon share cards, thumbnails, and full-size photos', () => {
		expect(
			classifyImageUrl(
				'https://m.media-amazon.com/images/I/816A65vK6cL.jpg_BO30,255,255,255_UF800,800_SR860,800,1,L_SR1910,1000,0,R_PI2026-pbdd-socialshare-awareness-en-US-d-nondeal,TopLeft,0,0_QL100_.jpg'
			)
		).toBe('share-card')
		expect(classifyImageUrl('https://m.media-amazon.com/images/I/41-BcmX4J7L._AC_US40_.jpg')).toBe('thumbnail')
		expect(classifyImageUrl('https://m.media-amazon.com/images/I/41GMRVNSxsL._AC_US100_.jpg')).toBe('thumbnail')
		expect(classifyImageUrl('https://m.media-amazon.com/images/I/816A65vK6cL._AC_SX300_SY300_QL70_ML2_.jpg')).toBe('photo')
		expect(classifyImageUrl('https://m.media-amazon.com/images/I/816A65vK6cL._AC_SL1500_.jpg')).toBe('photo')
		expect(classifyImageUrl('https://m.media-amazon.com/images/I/31sR9FweQ1L.jpg')).toBe('photo')
	})

	it('classifies small generic images by width hints', () => {
		expect(classifyImageUrl('https://cdn.example.test/p/widget.jpg?w=100')).toBe('thumbnail')
		expect(classifyImageUrl('https://cdn.example.test/p/widget.jpg?w=800')).toBe('photo')
		expect(classifyImageUrl('https://shop.example.test/cdn/shop/files/widget_100x100.jpg?v=1')).toBe('thumbnail')
		expect(classifyImageUrl('https://shop.example.test/cdn/shop/files/widget_1200x.jpg?v=1')).toBe('photo')
		expect(classifyImageUrl('https://cdn.example.test/p/widget.jpg')).toBe('photo')
	})
})

describe('bestImageClass', () => {
	it('returns the best usable class, skipping trackers and inline URLs', () => {
		expect(bestImageClass([])).toBeUndefined()
		expect(bestImageClass(['data:image/gif;base64,R0lGODlhAQABAAAAACw=', 'https://doubleclick.net/p.gif'])).toBeUndefined()
		expect(bestImageClass(['https://m.media-amazon.com/images/I/41-BcmX4J7L._AC_US40_.jpg'])).toBe('thumbnail')
		expect(bestImageClass(['https://m.media-amazon.com/images/I/41-BcmX4J7L._AC_US40_.jpg', 'https://cdn.example.test/p/widget.jpg'])).toBe(
			'photo'
		)
	})
})

describe('filterAndSortImages: Shopify size variants', () => {
	const base = 'https://shop.example.test/cdn/shop/files/HAT-01'
	it('keeps the largest suffixed rendition in the first variant slot', () => {
		expect(
			filterAndSortImages([
				`${base}_1024x1024.jpg?v=1`,
				`${base}_1200x1600.jpg?v=1`,
				`${base}_36x47.jpg?v=1`,
				'https://shop.example.test/cdn/shop/files/HAT-02_525x700.jpg?v=2',
			])
		).toEqual([`${base}_1200x1600.jpg?v=1`, 'https://shop.example.test/cdn/shop/files/HAT-02_525x700.jpg?v=2'])
	})

	it('prefers the unsuffixed original over any sized rendition', () => {
		expect(filterAndSortImages([`${base}_1200x1200.png?v=1`, `${base}.png?v=1`])).toEqual([`${base}.png?v=1`])
	})
})

describe('filterAndSortImages: ranking by class', () => {
	it('puts real photos first, then share cards, then thumbnails, keeping source order within a class', () => {
		const shareCard = 'https://m.media-amazon.com/images/I/AAA.jpg_BO30,255,255,255_UF800,800_SR1910,1000,0,C_QL100_.jpg'
		const thumb = 'https://cdn.example.test/swatch.png?w=96'
		const photoA = 'https://cdn.example.test/a.jpg'
		const photoB = 'https://cdn.example.test/b.jpg'
		expect(filterAndSortImages([thumb, shareCard, photoA, photoB])).toEqual([photoA, photoB, shareCard, thumb])
	})
})
