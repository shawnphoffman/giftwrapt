// The locale model (plan 36b). Client-safe: no database, no request access,
// and no import of the generated Paraglide runtime, so scripts and tooling
// that never run the compiler can still load it.
//
// A locale is a bare language ('en', 'fr'). Regional tags ('fr-CA', 'en-GB')
// resolve to their language.

// Every locale with a message catalog. Must match `locales` and `baseLocale`
// in project.inlang/settings.json; a unit test compares the two.
export const LOCALES = ['en', 'fr'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

// Carries the locale between requests. Written when a user picks a language
// and when they sign in (from `users.locale`); read by the server on every
// request. Only the server writes it. It is not HttpOnly so the language
// picker can tell an explicit choice from "follow my browser".
export const LOCALE_COOKIE = 'gw-locale'
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 400

// Which languages this deployment offers is the operator's choice, made with
// the APP_LOCALES environment variable: a comma-separated list such as `fr`
// or `en,fr`. Unset means English only. A deployment is somebody's own, so a
// language is never switched on for them.
//
//   - One language: the whole instance is in it. There is no picker, no
//     admin default, and the browser's language is not consulted.
//   - Several: people can choose, the browser's language is matched, and
//     the first one listed is the default until an admin picks another.
//
// It is read at runtime so a prebuilt image can be configured. The server
// reads the environment; the browser reads the list the server rendered onto
// `<html data-locales>`, so both always agree.
export const LOCALES_ENV = 'APP_LOCALES'
export const LOCALES_ATTRIBUTE = 'data-locales'

// 'fr, EN ,xx,fr' -> ['fr', 'en']. Order is kept (the first is the default),
// duplicates and codes without a catalog are dropped, and an empty or
// useless value means English only.
export function parseLocaleList(raw: string | null | undefined): Array<Locale> {
	const out: Array<Locale> = []
	for (const part of (raw ?? '').split(',')) {
		const code = part.trim().toLowerCase()
		if (isLocale(code) && !out.includes(code)) out.push(code)
	}
	return out.length > 0 ? out : [DEFAULT_LOCALE]
}

// Codes in the variable that no catalog exists for, so startup can say so.
export function unknownLocaleCodes(raw: string | null | undefined): Array<string> {
	return (raw ?? '')
		.split(',')
		.map(part => part.trim())
		.filter(part => part !== '' && !isLocale(part.toLowerCase()))
}

let offered: ReadonlyArray<Locale> | null = null

function readOffered(): ReadonlyArray<Locale> {
	if (typeof document !== 'undefined') return parseLocaleList(document.documentElement.getAttribute(LOCALES_ATTRIBUTE))
	// Read straight from the environment, not through `@/env`: this module is
	// also loaded in the browser and by scripts, where that one must not be.
	const env = typeof process !== 'undefined' ? process.env : undefined
	return parseLocaleList(env?.[LOCALES_ENV])
}

/** The languages this deployment offers, default first. */
export function offeredLocales(): ReadonlyArray<Locale> {
	offered ??= readOffered()
	return offered
}

// For tests: offer a given list, or pass nothing to read the source again.
export function setOfferedLocalesForTesting(list?: ReadonlyArray<Locale>): void {
	offered = list ?? null
}

/** What the instance is in when nobody has chosen: the first language listed. */
export function fallbackLocale(list: ReadonlyArray<Locale> = offeredLocales()): Locale {
	return list[0] ?? DEFAULT_LOCALE
}

export function isLocale(value: unknown): value is Locale {
	return typeof value === 'string' && (LOCALES as ReadonlyArray<string>).includes(value)
}

export function isOfferedLocale(value: unknown): value is Locale {
	return isLocale(value) && offeredLocales().includes(value)
}

// The functions below take the list of offered locales as a last argument so
// the rules can be tested with more than one; callers leave it out.

// 'fr-CA' -> 'fr', 'EN_us' -> 'en'. Null for anything that is not offered.
export function matchLocale(tag: string | null | undefined, list: ReadonlyArray<Locale> = offeredLocales()): Locale | null {
	if (!tag) return null
	const language = tag.trim().toLowerCase().split(/[-_]/)[0]
	return isLocale(language) && list.includes(language) ? language : null
}

// Picks the best offered locale from an Accept-Language header, honouring
// q-values. 'de, fr-CA;q=0.8, en;q=0.5' -> 'fr'.
export function negotiateLocale(acceptLanguage: string | null | undefined, list: ReadonlyArray<Locale> = offeredLocales()): Locale | null {
	if (!acceptLanguage) return null
	const ranked = acceptLanguage
		.split(',')
		.map((part, index) => {
			const [tag, ...params] = part.trim().split(';')
			const q = params.map(p => p.trim()).find(p => p.startsWith('q='))
			const weight = q ? Number.parseFloat(q.slice(2)) : 1
			return { tag, weight: Number.isFinite(weight) ? weight : 0, index }
		})
		.filter(entry => entry.weight > 0)
		.sort((a, b) => b.weight - a.weight || a.index - b.index)
	for (const { tag } of ranked) {
		const match = matchLocale(tag, list)
		if (match) return match
	}
	return null
}

export type LocaleSources = {
	// The `gw-locale` cookie: the user's explicit choice on this device, or
	// their account's choice copied in at sign-in.
	cookie?: string | null
	acceptLanguage?: string | null
	// The deployment's default (`defaultLocale` app setting).
	defaultLocale?: string | null
	// The iOS app's web tab. There the device language wins over a stored
	// choice so the tab matches the native screens around it.
	embedded?: boolean
}

// Which locale a request renders in. Outside the iOS web tab: the stored
// choice, then the browser's languages, then the deployment default. Inside
// it the browser's languages (the app's language on the device) come first.
export function resolveLocale(
	{ cookie, acceptLanguage, defaultLocale, embedded = false }: LocaleSources,
	list: ReadonlyArray<Locale> = offeredLocales()
): Locale {
	const stored = matchLocale(cookie, list)
	const negotiated = negotiateLocale(acceptLanguage, list)
	const fallback = matchLocale(defaultLocale, list) ?? fallbackLocale(list)
	if (embedded) return negotiated ?? stored ?? fallback
	return stored ?? negotiated ?? fallback
}

export function readLocaleCookie(cookieHeader: string | null | undefined): string | null {
	if (!cookieHeader) return null
	for (const part of cookieHeader.split(';')) {
		const [name, ...rest] = part.trim().split('=')
		if (name === LOCALE_COOKIE) return decodeURIComponent(rest.join('='))
	}
	return null
}

export function serializeLocaleCookie(locale: Locale, { secure }: { secure: boolean }): string {
	return `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${secure ? '; Secure' : ''}`
}

// The language's own name, for pickers: 'English', 'Français'.
export function localeDisplayName(locale: Locale): string {
	const name = new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale
	return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1)
}
