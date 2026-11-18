import { describe, expect, it } from 'vitest'

import {
	DEFAULT_LOCALE,
	isLocale,
	type Locale,
	localeDisplayName,
	LOCALES,
	matchLocale,
	negotiateLocale,
	readLocaleCookie,
	READY_LOCALES,
	resolveLocale,
	serializeLocaleCookie,
} from '@/lib/i18n/locales'
import { baseLocale, locales } from '@/paraglide/runtime.js'

// The rules are tested with both compiled locales offered. Only English is
// offered in the app until the French translation ships (plan 36i).
const BOTH: ReadonlyArray<Locale> = ['en', 'fr']

describe('locale helpers', () => {
	it('lists exactly the locales Paraglide compiles', () => {
		expect([...LOCALES]).toEqual([...locales])
		expect(DEFAULT_LOCALE).toBe(baseLocale)
	})

	it('knows the compiled locales', () => {
		expect(isLocale('en')).toBe(true)
		expect(isLocale('fr')).toBe(true)
		expect(isLocale('de')).toBe(false)
		expect(isLocale(null)).toBe(false)
		expect(DEFAULT_LOCALE).toBe('en')
	})

	it('offers only finished locales, so an unfinished one is never resolved', () => {
		expect(READY_LOCALES).toEqual(['en'])
		expect(matchLocale('fr-FR')).toBeNull()
		expect(resolveLocale({ cookie: 'fr', acceptLanguage: 'fr', defaultLocale: 'fr' })).toBe('en')
	})

	it('reads and writes the cookie', () => {
		expect(readLocaleCookie('a=1; gw-locale=fr; b=2')).toBe('fr')
		expect(readLocaleCookie('a=1')).toBeNull()
		expect(readLocaleCookie(null)).toBeNull()
		expect(serializeLocaleCookie('fr', { secure: true })).toBe('gw-locale=fr; Path=/; Max-Age=34560000; SameSite=Lax; Secure')
		expect(serializeLocaleCookie('en', { secure: false })).not.toContain('Secure')
	})

	it('names a language in that language', () => {
		expect(localeDisplayName('en')).toBe('English')
		expect(localeDisplayName('fr')).toBe('Français')
	})
})

describe('matchLocale', () => {
	it('reduces a regional tag to its language', () => {
		expect(matchLocale('fr-CA', BOTH)).toBe('fr')
		expect(matchLocale('EN_us', BOTH)).toBe('en')
		expect(matchLocale(' fr ', BOTH)).toBe('fr')
	})

	it('returns null for unknown or missing tags', () => {
		expect(matchLocale('de', BOTH)).toBeNull()
		expect(matchLocale('', BOTH)).toBeNull()
		expect(matchLocale(null, BOTH)).toBeNull()
	})
})

describe('negotiateLocale', () => {
	it('takes the highest-weighted offered language', () => {
		expect(negotiateLocale('de, fr-CA;q=0.8, en;q=0.5', BOTH)).toBe('fr')
		expect(negotiateLocale('fr;q=0.2, en;q=0.9', BOTH)).toBe('en')
	})

	it('keeps header order between equal weights', () => {
		expect(negotiateLocale('fr, en', BOTH)).toBe('fr')
		expect(negotiateLocale('en, fr', BOTH)).toBe('en')
	})

	it('ignores q=0 and malformed weights', () => {
		expect(negotiateLocale('fr;q=0, en', BOTH)).toBe('en')
		expect(negotiateLocale('fr;q=abc', BOTH)).toBeNull()
	})

	it('returns null when nothing matches', () => {
		expect(negotiateLocale('de, ja', BOTH)).toBeNull()
		expect(negotiateLocale(null, BOTH)).toBeNull()
	})
})

describe('resolveLocale', () => {
	it('prefers the stored choice, then the browser, then the deployment default', () => {
		expect(resolveLocale({ cookie: 'fr', acceptLanguage: 'en', defaultLocale: 'en' }, BOTH)).toBe('fr')
		expect(resolveLocale({ cookie: null, acceptLanguage: 'fr-FR,fr;q=0.9', defaultLocale: 'en' }, BOTH)).toBe('fr')
		expect(resolveLocale({ acceptLanguage: 'de', defaultLocale: 'fr' }, BOTH)).toBe('fr')
		expect(resolveLocale({}, BOTH)).toBe('en')
	})

	it('skips a stored value that is not a locale', () => {
		expect(resolveLocale({ cookie: 'zz', acceptLanguage: 'fr' }, BOTH)).toBe('fr')
		expect(resolveLocale({ defaultLocale: 'not-a-locale' }, BOTH)).toBe('en')
	})

	it('lets the device language win inside the iOS web tab', () => {
		expect(resolveLocale({ cookie: 'fr', acceptLanguage: 'en-US', embedded: true }, BOTH)).toBe('en')
		expect(resolveLocale({ cookie: 'fr', acceptLanguage: 'de', embedded: true }, BOTH)).toBe('fr')
		expect(resolveLocale({ acceptLanguage: 'de', defaultLocale: 'fr', embedded: true }, BOTH)).toBe('fr')
	})
})
