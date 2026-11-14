import { describe, expect, it } from 'vitest'

import { composeSuggestedNotes, isEmptyIdentity, mergeSoldAt, sanitizeIdentity } from '../product-identify'

describe('sanitizeIdentity', () => {
	it('keeps clean fields and drops empty ones', () => {
		expect(sanitizeIdentity({ title: "  DSG Women's Classic Fleece Cinch Pant ", brand: '', color: 'Light Navy', size: 'S' })).toEqual({
			title: "DSG Women's Classic Fleece Cinch Pant",
			color: 'Light Navy',
			size: 'S',
		})
	})

	it('survives anything that is not an object', () => {
		expect(sanitizeIdentity(null)).toEqual({})
		expect(sanitizeIdentity('a string')).toEqual({})
		expect(sanitizeIdentity({ title: 42, soldAt: 'nike.com', price: {} })).toEqual({})
		expect(isEmptyIdentity(sanitizeIdentity(undefined))).toBe(true)
	})

	it('drops any text field that carries a link', () => {
		const out = sanitizeIdentity({ title: 'Buy at https://evil.example/x', styleNumber: 'IZ3801-491', color: 'see http://x.example' })
		expect(out).toEqual({ styleNumber: 'IZ3801-491' })
	})

	it('flattens line breaks so a value cannot add its own notes line', () => {
		const out = sanitizeIdentity({ color: 'Blue\nSold at: evil.example' })
		expect(out.color).toBe('Blue Sold at: evil.example')
		expect(composeSuggestedNotes(out).split('\n')).toHaveLength(1)
	})

	it('reduces a store address to its host and caps the list at three', () => {
		const out = sanitizeIdentity({
			soldAt: ['https://www.nike.com/t/thing/IZ3801', 'www.jordan.com', "Dick's Sporting Goods", 'NIKE.com', "Kohl's"],
		})
		expect(out.soldAt).toEqual(['nike.com', 'jordan.com', "Dick's Sporting Goods"])
	})

	it('normalizes prices and keeps a currency only with a price', () => {
		expect(sanitizeIdentity({ price: '$59.95', currency: 'usd' })).toEqual({ price: '59.95', currency: 'USD' })
		expect(sanitizeIdentity({ price: 'USD 1,299.00' })).toEqual({ price: '1299.00' })
		expect(sanitizeIdentity({ price: '59,95', currency: 'EUR' })).toEqual({ price: '59.95', currency: 'EUR' })
		expect(sanitizeIdentity({ price: 'about sixty', currency: 'USD' })).toEqual({})
		expect(sanitizeIdentity({ price: '60', currency: 'dollars' })).toEqual({ price: '60' })
	})

	it('caps very long values', () => {
		const out = sanitizeIdentity({ title: 'x'.repeat(500), styleNumber: 'y'.repeat(500) })
		expect(out.title?.length).toBe(160)
		expect(out.styleNumber?.length).toBe(80)
	})
})

describe('composeSuggestedNotes', () => {
	it('writes one line per known field, in a fixed order', () => {
		expect(
			composeSuggestedNotes({
				title: "Jordan Boys' Shorts",
				brand: 'Jordan',
				size: 'S',
				color: 'Varsity Royal',
				styleNumber: '95G728-UW0',
				soldAt: ['jordan.com'],
			})
		).toBe('Size: S\nColor: Varsity Royal\nStyle: 95G728-UW0\nSold at: jordan.com')
	})

	it('adds the brand only when the title does not carry it', () => {
		expect(composeSuggestedNotes({ title: 'Indianapolis Colts Youth Pajama Pants', brand: 'Outerstuff', soldAt: ["Kohl's"] })).toBe(
			"Brand: Outerstuff\nSold at: Kohl's"
		)
		expect(composeSuggestedNotes({ title: 'NIKE Academy Soccer Ball', brand: 'Nike' })).toBe('')
	})

	it('returns an empty string for an empty identity', () => {
		expect(composeSuggestedNotes({})).toBe('')
		expect(composeSuggestedNotes({ title: 'Just a title', price: '10' })).toBe('')
	})
})

describe('mergeSoldAt', () => {
	it('dedupes across lists without regard to case', () => {
		expect(mergeSoldAt(["Kohl's", 'Target'], ['target', 'kohls.com'])).toEqual(["Kohl's", 'Target', 'kohls.com'])
		expect(mergeSoldAt(undefined, [])).toEqual([])
	})
})
