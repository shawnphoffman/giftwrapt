import { describe, expect, it } from 'vitest'

import { parseAppleNotes } from '../apple-notes'

describe('parseAppleNotes (plain text)', () => {
	it('returns one draft per non-empty line', () => {
		const out = parseAppleNotes('Coffee grinder\nGardening gloves\n')
		expect(out.map(d => d.title)).toEqual(['Coffee grinder', 'Gardening gloves'])
		expect(out.every(d => d.url === null)).toBe(true)
	})

	it('strips Apple bullet glyphs', () => {
		const out = parseAppleNotes('• Coffee grinder\n● Gardening gloves\n○ Notebook\n→ Pen\n– Tea\n— Mug\n* Cup\n- Plate')
		expect(out.map(d => d.title)).toEqual(['Coffee grinder', 'Gardening gloves', 'Notebook', 'Pen', 'Tea', 'Mug', 'Cup', 'Plate'])
	})

	it('extracts URL into url, leaves remainder in title', () => {
		const out = parseAppleNotes('Coffee grinder https://shop.example.com/grinder')
		expect(out).toHaveLength(1)
		expect(out[0]).toMatchObject({ title: 'Coffee grinder', url: 'https://shop.example.com/grinder' })
	})

	it('leaves title null on URL-only line', () => {
		const out = parseAppleNotes('• https://shop.example.com/grinder')
		expect(out).toHaveLength(1)
		expect(out[0]).toMatchObject({ title: null, url: 'https://shop.example.com/grinder' })
	})

	it('drops empty lines', () => {
		const out = parseAppleNotes('Coffee\n\n  \n\nGloves')
		expect(out.map(d => d.title)).toEqual(['Coffee', 'Gloves'])
	})

	it('strips trailing punctuation around inline URLs', () => {
		const out = parseAppleNotes('Coffee grinder - https://shop.example.com/grinder')
		expect(out[0]).toMatchObject({ title: 'Coffee grinder', url: 'https://shop.example.com/grinder' })
	})
})

describe('parseAppleNotes (HTML)', () => {
	it('walks <li> entries and pulls <a href> into url', () => {
		const html = `
			<ul>
				<li><a href="https://example.com/x">Bluetooth headphones</a></li>
				<li>Coffee grinder <a href="https://example.com/g">link</a></li>
				<li>Plain item</li>
			</ul>
		`
		const out = parseAppleNotes(html)
		expect(out).toHaveLength(3)
		expect(out[0]).toMatchObject({ title: null, url: 'https://example.com/x' })
		expect(out[1]).toMatchObject({ title: 'Coffee grinder', url: 'https://example.com/g' })
		expect(out[2]).toMatchObject({ title: 'Plain item', url: null })
	})

	it('handles <p> rows with bullet glyphs in text', () => {
		const html = '<div><p>• Coffee grinder</p><p>● Gardening gloves</p></div>'
		const out = parseAppleNotes(html)
		expect(out.map(d => d.title)).toEqual(['Coffee grinder', 'Gardening gloves'])
	})

	it('extracts URL from text when no <a> wrapper', () => {
		const html = '<p>Buy this https://shop.example.com/x</p>'
		const out = parseAppleNotes(html)
		expect(out[0]).toMatchObject({ title: 'Buy this', url: 'https://shop.example.com/x' })
	})

	it('returns empty for empty input', () => {
		expect(parseAppleNotes('')).toEqual([])
	})

	it('detects HTML by leading angle bracket', () => {
		// Sanity: if the first 100 chars contain "<", we route to the HTML
		// parser. A long plain-text first paragraph with no "<" routes to
		// the plain-text parser. This fixture mimics a representative
		// rich-text paste that starts with a <meta> tag.
		const html = '<meta charset="utf-8"><div><p>Coffee grinder</p><p>Gardening gloves</p></div>'
		const out = parseAppleNotes(html)
		expect(out.map(d => d.title)).toEqual(['Coffee grinder', 'Gardening gloves'])
	})
})
