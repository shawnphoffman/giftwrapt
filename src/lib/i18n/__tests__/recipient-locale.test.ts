import { describe, expect, it } from 'vitest'

import { recipientLocale } from '../recipient-locale'

describe('recipientLocale', () => {
	it("uses the person's own choice when it is offered", () => {
		expect(recipientLocale('en', 'fr')).toBe('en')
	})

	it('falls back to the deployment default, then to English', () => {
		expect(recipientLocale(null, 'en')).toBe('en')
		expect(recipientLocale(undefined, null)).toBe('en')
		expect(recipientLocale('xx', 'yy')).toBe('en')
	})

	it('does not write in a language that is not offered yet', () => {
		// French has a catalog but is not offered until its translation is
		// finished (or a preview build opts in).
		expect(recipientLocale('fr', 'fr')).toBe('en')
	})
})
