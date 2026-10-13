import { describe, expect, it } from 'vitest'

import {
	buildGiftSuggestionsUserPrompt,
	MAX_ALREADY_HAS_LINES,
	MAX_NO_LONGER_LISTED_LINES,
	MAX_PROMPT_ITEMS,
	MAX_PROMPT_LINES,
	sanitizeSuggestions,
	titlesOverlap,
} from '../prompt'

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
			alreadyHas: [
				{ title: 'Air Fryer', source: 'received', when: '2025-12' },
				{ title: 'Blender', source: 'marked', when: null },
			],
			noLongerListed: [
				{ title: 'Old Lamp', reason: 'unavailable', when: null },
				{ title: 'Kettle', reason: 'removed', when: '2025-06' },
			],
			declined: ['Novelty Socks'],
			occasion: 'birthday',
			budget: 50,
		})
		expect(prompt).toContain('- [claimed] Merino Scarf (price 35, priority high, clothing)')
		expect(prompt).toContain('- [open] Trail Map')
		expect(prompt).toContain('Occasion: birthday')
		expect(prompt).toContain('Budget: up to 50')
		expect(prompt).toContain('The shopper’s own ideas so far: Bird Feeder')
		expect(prompt).toContain('Already given or planned by the shopper: Tea Sampler')
		expect(prompt).toContain('They already have: Air Fryer (received 2025-12); Blender (marked by a gifter)')
		expect(prompt).toContain('No longer on their list: Old Lamp (unavailable); Kettle (removed 2025-06)')
		expect(prompt).toContain('The shopper is not interested in: Novelty Socks')
		// Open items are listed ahead of claimed ones.
		expect(prompt.indexOf('[open] Trail Map')).toBeLessThan(prompt.indexOf('[claimed] Merino Scarf'))
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
			alreadyHas: [],
			noLongerListed: [],
			declined: [],
			occasion: null,
			budget: null,
		})
		expect(prompt.match(/^- \[open\]/gmu)).toHaveLength(MAX_PROMPT_ITEMS)
		expect(prompt).toContain('Occasion: none given')
		expect(prompt).toContain('They already have: nothing known')
		expect(prompt).toContain('No longer on their list: nothing')
		expect(prompt).toContain('The shopper is not interested in: nothing in particular')
	})

	it('fills the profile strongest role first and drops history when room runs out', () => {
		const many = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix} ${i}`)
		const prompt = buildGiftSuggestionsUserPrompt({
			recipientFirstName: 'Sam',
			recipientKind: 'user',
			items: many(MAX_PROMPT_ITEMS + 5, 'Want').map(title => ({ title, price: null, priority: 'normal', category: null, claimed: false })),
			myIdeas: [],
			myPastGifts: [],
			alreadyHas: many(MAX_ALREADY_HAS_LINES + 5, 'Has').map(title => ({ title, source: 'marked' as const, when: null })),
			noLongerListed: many(MAX_NO_LONGER_LISTED_LINES + 5, 'Gone').map(title => ({ title, reason: 'removed' as const, when: null })),
			declined: [],
			occasion: null,
			budget: null,
		})
		const hasLine = prompt.split('\n').find(l => l.startsWith('They already have:'))!
		const goneLine = prompt.split('\n').find(l => l.startsWith('No longer on their list:'))!
		expect(prompt.match(/^- \[open\]/gmu)).toHaveLength(MAX_PROMPT_ITEMS)
		// 60 lines in all: 40 items, then 20 of the owned titles, then nothing left for history.
		expect(hasLine.split('; ')).toHaveLength(MAX_PROMPT_LINES - MAX_PROMPT_ITEMS)
		expect(goneLine).toBe('No longer on their list: nothing')
	})
})

describe('titlesOverlap', () => {
	it('needs most of the shorter title’s real words, and at least two of them', () => {
		expect(titlesOverlap('espresso puck screen set', 'espresso puck screen and dosing funnel')).toBe(true)
		expect(titlesOverlap('band saw blade variety pack', 'band saw blade assortment')).toBe(true)
		expect(titlesOverlap('trail map', 'trail guide book')).toBe(false)
		expect(titlesOverlap('camera sling bag', 'camera lens cleaning kit')).toBe(false)
		// A single significant word never counts as a copy.
		expect(titlesOverlap('gift card', 'card game set')).toBe(false)
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

	it('drops a near copy of something known, in different words', () => {
		// Seen on hoffstuff.com: the shopper marked the first as owned, the model offered the second.
		const out = sanitizeSuggestions(
			[
				s('Espresso Puck Screen and Dosing Funnel'),
				s('Band Saw Blade Assortment'),
				s('Camera Sling Bag'),
				s('Merino Wool Travel Neck Gaiter'),
			],
			['Espresso Puck Screen Set', 'Band Saw Blade Variety Pack', 'Camera Lens Cleaning Kit', 'Merino Scarf']
		)
		// One shared word (camera, merino) is not a copy; most of the words is.
		expect(out.map(o => o.title)).toEqual(['Camera Sling Bag', 'Merino Wool Travel Neck Gaiter'])
	})

	it('collapses near copies inside one answer too', () => {
		const out = sanitizeSuggestions([s('Japanese Pull Saw'), s('Japanese Pull Saw for Woodworking'), s('Pull Saw Blade')], [])
		expect(out.map(o => o.title)).toEqual(['Japanese Pull Saw', 'Pull Saw Blade'])
	})

	it('removes duplicates and caps the list at eight', () => {
		const out = sanitizeSuggestions(
			[
				s('Hiking Socks'),
				s('hiking socks!'),
				...[
					'Trail Map',
					'Pour Over Kettle',
					'Bird Feeder',
					'Camping Hammock',
					'Chef Knife',
					'Fountain Pen',
					'Yoga Mat',
					'Puzzle Book',
					'Garden Trowel',
					'Wool Beanie',
					'Desk Lamp',
					'Tea Sampler',
				].map(t => s(t)),
			],
			[]
		)
		expect(out).toHaveLength(8)
		expect(out.filter(o => /hiking socks/iu.test(o.title))).toHaveLength(1)
	})
})
