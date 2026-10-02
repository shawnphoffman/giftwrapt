import { describe, expect, it } from 'vitest'

import { buildPasteItemsUserPrompt, MAX_EXTRACTED_ITEMS, MAX_PASTE_CHARS, sanitizeExtractedItems } from '../prompt'

const TEXT = 'Christmas ideas:\n- blue enamel mug, the big one https://shop.example.com/mug\n- wool socks size M ~$18\n'

const item = (title: string, url = '', price = '', notes = '') => ({ title, url, price, notes })

describe('sanitizeExtractedItems', () => {
	it('keeps a link only when it is in the pasted text', () => {
		const out = sanitizeExtractedItems(
			[
				item('Blue Enamel Mug', 'https://shop.example.com/mug', '', 'the big one'),
				item('Wool Socks', 'https://invented.example.com/socks', '$18', 'size M'),
				item('Sneaky', 'javascript:alert(1)'),
			],
			TEXT
		)
		expect(out).toEqual([
			{ title: 'Blue Enamel Mug', url: 'https://shop.example.com/mug', price: null, notes: 'the big one' },
			{ title: 'Wool Socks', url: null, price: '$18', notes: 'size M' },
			{ title: 'Sneaky', url: null, price: null, notes: null },
		])
	})

	it('drops empty and duplicate titles and caps the list', () => {
		const many = Array.from({ length: MAX_EXTRACTED_ITEMS + 10 }, (_, n) => item(`Thing ${n}`))
		const out = sanitizeExtractedItems([item('  '), item('Wool Socks'), item('wool socks'), ...many], TEXT)
		expect(out).toHaveLength(MAX_EXTRACTED_ITEMS)
		expect(out.filter(o => o.title.toLowerCase() === 'wool socks')).toHaveLength(1)
	})
})

describe('buildPasteItemsUserPrompt', () => {
	it('wraps the text as data and clips it', () => {
		const prompt = buildPasteItemsUserPrompt('x'.repeat(MAX_PASTE_CHARS + 500))
		expect(prompt.startsWith('<PASTED>\n')).toBe(true)
		expect(prompt.endsWith('\n</PASTED>')).toBe(true)
		expect(prompt.length).toBe(MAX_PASTE_CHARS + '<PASTED>\n\n</PASTED>'.length)
	})
})
