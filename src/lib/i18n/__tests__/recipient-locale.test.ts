import { afterEach, describe, expect, it } from 'vitest'

import { setOfferedLocalesForTesting } from '../locales'
import { recipientLocale } from '../recipient-locale'

describe('recipientLocale', () => {
	afterEach(() => setOfferedLocalesForTesting())

	it("uses the person's own choice when it is offered", () => {
		expect(recipientLocale('en', 'fr')).toBe('en')
	})

	it('falls back to the deployment default, then to English', () => {
		expect(recipientLocale(null, 'en')).toBe('en')
		expect(recipientLocale(undefined, null)).toBe('en')
		expect(recipientLocale('xx', 'yy')).toBe('en')
	})

	it('does not write in a language the deployment does not offer', () => {
		// French has a catalog, but nothing lists it in APP_LOCALES here.
		expect(recipientLocale('fr', 'fr')).toBe('en')
	})

	it('follows the deployment once it offers French', () => {
		setOfferedLocalesForTesting(['fr', 'en'])
		expect(recipientLocale('en', '')).toBe('en')
		expect(recipientLocale(null, '')).toBe('fr')
		expect(recipientLocale(null, 'en')).toBe('en')
	})
})
