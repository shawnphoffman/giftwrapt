import { describe, expect, it } from 'vitest'

import { buildThankYouUserPrompt, cleanNote, MAX_NOTE_CHARS, MAX_THANK_YOU_GIFTS } from '../prompt'

describe('buildThankYouUserPrompt', () => {
	it('carries first names and gift titles, and nothing else', () => {
		const prompt = buildThankYouUserPrompt({
			fromFirstName: 'Sam',
			onBehalfOf: null,
			giverFirstNames: ['Kate', 'Jeff'],
			giftTitles: ['Merino Scarf', 'Trail Map Poster'],
		})
		expect(prompt).toBe('From: Sam\nTo: Kate and Jeff\nGifts:\n- Merino Scarf\n- Trail Map Poster')
	})

	it('says who the gifts were for when a guardian writes for a dependent', () => {
		const prompt = buildThankYouUserPrompt({
			fromFirstName: 'Sam',
			onBehalfOf: 'Fido',
			giverFirstNames: ['Kate'],
			giftTitles: ['Chew Toy'],
		})
		expect(prompt).toContain('The gifts were for: Fido')
	})

	it('caps the number of gifts it lists', () => {
		const prompt = buildThankYouUserPrompt({
			fromFirstName: 'Sam',
			onBehalfOf: null,
			giverFirstNames: ['Kate'],
			giftTitles: Array.from({ length: MAX_THANK_YOU_GIFTS + 5 }, (_, n) => `Gift ${n}`),
		})
		expect(prompt.match(/^- /gmu)).toHaveLength(MAX_THANK_YOU_GIFTS)
	})
})

describe('cleanNote', () => {
	it('drops wrapping quotes and invented links, and bounds the length', () => {
		expect(cleanNote('"Dear Kate, thank you! See https://example.com/x\n\n\n\nSam"')).toBe('Dear Kate, thank you! See\n\nSam')
		expect(cleanNote('x'.repeat(MAX_NOTE_CHARS + 50))).toHaveLength(MAX_NOTE_CHARS)
	})
})
