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

// Locales people can choose. A locale is compiled in as soon as its catalog
// exists, but it is only offered (in the language picker, the admin default,
// and Accept-Language matching) once its translation is finished, so nobody
// lands in a half-translated app. French joins FINISHED_LOCALES in plan 36i.
const FINISHED_LOCALES: ReadonlyArray<Locale> = ['en']

// A build can offer unfinished locales too, to review a translation in
// progress: set VITE_PREVIEW_LOCALES to a comma-separated list (for example
// `fr`) on a preview deployment. Never set it for production.
function previewLocales(): Array<Locale> {
	// `import.meta.env` only exists under Vite; plain Node scripts get none.
	const raw = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_PREVIEW_LOCALES ?? ''
	return raw
		.split(',')
		.map(part => part.trim())
		.filter((part): part is Locale => (LOCALES as ReadonlyArray<string>).includes(part))
}

export const READY_LOCALES: ReadonlyArray<Locale> = LOCALES.filter(
	locale => FINISHED_LOCALES.includes(locale) || previewLocales().includes(locale)
)

export function isLocale(value: unknown): value is Locale {
	return typeof value === 'string' && (LOCALES as ReadonlyArray<string>).includes(value)
}

export function isReadyLocale(value: unknown): value is Locale {
	return isLocale(value) && READY_LOCALES.includes(value)
}

// The functions below take the list of offered locales as a last argument so
// the rules can be tested with more than one; callers leave it out.

// 'fr-CA' -> 'fr', 'EN_us' -> 'en'. Null for anything that is not offered.
export function matchLocale(tag: string | null | undefined, offered: ReadonlyArray<Locale> = READY_LOCALES): Locale | null {
	if (!tag) return null
	const language = tag.trim().toLowerCase().split(/[-_]/)[0]
	return isLocale(language) && offered.includes(language) ? language : null
}

// Picks the best offered locale from an Accept-Language header, honouring
// q-values. 'de, fr-CA;q=0.8, en;q=0.5' -> 'fr'.
export function negotiateLocale(acceptLanguage: string | null | undefined, offered: ReadonlyArray<Locale> = READY_LOCALES): Locale | null {
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
		const match = matchLocale(tag, offered)
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
	offered: ReadonlyArray<Locale> = READY_LOCALES
): Locale {
	const stored = matchLocale(cookie, offered)
	const negotiated = negotiateLocale(acceptLanguage, offered)
	const fallback = matchLocale(defaultLocale, offered) ?? DEFAULT_LOCALE
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
