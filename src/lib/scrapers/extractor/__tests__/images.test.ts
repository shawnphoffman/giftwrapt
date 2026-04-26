import { describe, expect, it } from 'vitest'

import { filterAndSortImages, looksLikeTrackingPixel } from '../images'

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

	it('passes real product image URLs through', () => {
		expect(looksLikeTrackingPixel('https://cdn.example.test/products/widget.jpg')).toBe(false)
		expect(looksLikeTrackingPixel('https://images.example.test/widget?w=600')).toBe(false)
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
