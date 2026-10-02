import { describe, expect, it } from 'vitest'

import { buildGiftSuggestionsUserPrompt, MAX_PROMPT_ITEMS, sanitizeSuggestions } from '../prompt'

describe('buildGiftSuggestionsUserPrompt', () => {
	it('marks each item open or claimed and says nothing else about claims', () => {
		const prompt = buildGiftSuggestionsUserPrompt({
			recipientFirstName: 'Sam',
			recipientKind: 'user',
			items: [
				{ title: 'Merino Scarf', price: '35', priority: 'high', category: 'clothing', claimed: true },
				{ title: 'Trail Map', price: null, priority: 'normal', category: null, claimed: false },
			],
			myIdeas: ['Bird Feeder'],
			myPastGifts: ['Tea Sampler'],
			occasion: 'birthday',
			budget: 50,
		})
		expect(prompt).toContain('- [claimed] Merino Scarf (price 35, priority high, clothing)')
		expect(prompt).toContain('- [open] Trail Map')
		expect(prompt).toContain('Occasion: birthday')
		expect(prompt).toContain('Budget: up to 50')
		expect(prompt).toContain('The shopper’s own ideas so far: Bird Feeder')
		expect(prompt).toContain('Already given or planned by the shopper: Tea Sampler')
	})

	it('caps how many items it sends', () => {
		const items = Array.from({ length: MAX_PROMPT_ITEMS + 20 }, (_, n) => ({
			title: `Item ${n}`,
			price: null,
			priority: 'normal',
			category: null,
			claimed: false,
		}))
		const prompt = buildGiftSuggestionsUserPrompt({
			recipientFirstName: 'Sam',
			recipientKind: 'user',
			items,
			myIdeas: [],
			myPastGifts: [],
			occasion: null,
			budget: null,
		})
		expect(prompt.match(/^- \[open\]/gmu)).toHaveLength(MAX_PROMPT_ITEMS)
		expect(prompt).toContain('Occasion: none given')
	})
})

describe('sanitizeSuggestions', () => {
	const s = (title: string, reason = 'Because of their list.', details = 'Look for a sturdy one.') => ({
		title,
		details,
		reason,
		priceBand: 'unknown' as const,
	})

	it('strips links the model made up, from every field', () => {
		const out = sanitizeSuggestions(
			[
				s(
					'Pour Over Kettle https://shop.example.com/kettle',
					'See www.example.com/deal for more, they like coffee.',
					'A gooseneck spout gives control. Buy at kettles.com today.'
				),
			],
			[]
		)
		expect(out).toEqual([
			{
				title: 'Pour Over Kettle',
				details: 'A gooseneck spout gives control. Buy at today.',
				reason: 'See for more, they like coffee.',
				priceBand: 'unknown',
			},
		])
	})

	it('drops anything already on the lists, already an idea, or already given', () => {
		const out = sanitizeSuggestions(
			[s('Merino Scarf'), s('A Bird Feeder Kit'), s('tea sampler'), s('Hiking Socks')],
			['Merino Scarf', 'Bird Feeder', 'Tea Sampler']
		)
		expect(out.map(o => o.title)).toEqual(['Hiking Socks'])
	})

	it('removes duplicates and caps the list at eight', () => {
		const out = sanitizeSuggestions(
			[s('Hiking Socks'), s('hiking socks!'), ...Array.from({ length: 12 }, (_, n) => s(`Idea Number ${n}`))],
			[]
		)
		expect(out).toHaveLength(8)
		expect(out.filter(o => /hiking socks/iu.test(o.title))).toHaveLength(1)
	})
})
