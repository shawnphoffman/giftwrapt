import { afterEach, describe, expect, it } from 'vitest'

import {
	DEFAULT_LOCALE,
	fallbackLocale,
	isLocale,
	isOfferedLocale,
	type Locale,
	localeDisplayName,
	LOCALES,
	matchLocale,
	negotiateLocale,
	offeredLocales,
	parseLocaleList,
	readLocaleCookie,
	resolveLocale,
	serializeLocaleCookie,
	setOfferedLocalesForTesting,
	unknownLocaleCodes,
} from '@/lib/i18n/locales'
import { baseLocale, locales } from '@/paraglide/runtime.js'

// The rules are tested with both compiled locales offered. A deployment
// offers only what its operator lists in APP_LOCALES; with nothing set, as
// here, that is English.
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

	it('offers English only when the operator lists nothing', () => {
		expect(offeredLocales()).toEqual(['en'])
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

describe('the languages a deployment offers (APP_LOCALES)', () => {
	afterEach(() => setOfferedLocalesForTesting())

	it('reads a list, keeping order and dropping what it cannot use', () => {
		expect(parseLocaleList('fr')).toEqual(['fr'])
		expect(parseLocaleList(' FR , en ,fr,xx')).toEqual(['fr', 'en'])
		expect(parseLocaleList('')).toEqual(['en'])
		expect(parseLocaleList(undefined)).toEqual(['en'])
		expect(parseLocaleList('xx,yy')).toEqual(['en'])
		expect(unknownLocaleCodes('fr, xx ,EN,')).toEqual(['xx'])
	})

	it('French only: everything resolves to French, whatever was stored or asked for', () => {
		setOfferedLocalesForTesting(['fr'])
		expect(fallbackLocale()).toBe('fr')
		expect(isOfferedLocale('en')).toBe(false)
		expect(resolveLocale({ cookie: 'en', acceptLanguage: 'en-US', defaultLocale: 'en' })).toBe('fr')
		expect(resolveLocale({})).toBe('fr')
	})

	it('several: the first listed is the default until an admin picks another', () => {
		setOfferedLocalesForTesting(['fr', 'en'])
		expect(resolveLocale({ acceptLanguage: 'de', defaultLocale: '' })).toBe('fr')
		expect(resolveLocale({ acceptLanguage: 'de', defaultLocale: 'en' })).toBe('en')
		expect(resolveLocale({ acceptLanguage: 'en-GB', defaultLocale: '' })).toBe('en')
		expect(resolveLocale({ cookie: 'en', acceptLanguage: 'fr', defaultLocale: '' })).toBe('en')
	})
})
