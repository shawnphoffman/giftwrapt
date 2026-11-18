import { db } from '@/db'
import { isEmbeddedUserAgent } from '@/lib/embedded'
import { DEFAULT_LOCALE, type Locale, matchLocale, readLocaleCookie, resolveLocale } from '@/lib/i18n/locales'
import { getAppSettings } from '@/lib/settings-loader'

// Server only: resolves the locale of an incoming request (plan 36b).

// The deployment default is read on every request, so it is cached briefly
// per server instance. An admin's change shows up within a minute.
const DEFAULT_LOCALE_TTL_MS = 60_000
let cachedDefault: { value: Locale; at: number } | null = null

export async function getDefaultLocale(now = Date.now()): Promise<Locale> {
	if (cachedDefault && now - cachedDefault.at < DEFAULT_LOCALE_TTL_MS) return cachedDefault.value
	let value: Locale = DEFAULT_LOCALE
	try {
		const settings = await getAppSettings(db)
		value = matchLocale(settings.defaultLocale) ?? DEFAULT_LOCALE
	} catch {
		// A database hiccup must not take the request down over a language
		// preference; fall back to the base locale and try again next time.
		return DEFAULT_LOCALE
	}
	cachedDefault = { value, at: now }
	return value
}

export function resetDefaultLocaleCache(): void {
	cachedDefault = null
}

// The stored choice (cookie), the browser's languages, then the deployment
// default; inside the iOS web tab the browser's languages come first. See
// `resolveLocale` for the rule and why.
export async function resolveRequestLocale(request: Request): Promise<Locale> {
	return resolveLocale({
		cookie: readLocaleCookie(request.headers.get('cookie')),
		acceptLanguage: request.headers.get('accept-language'),
		defaultLocale: await getDefaultLocale(),
		embedded: isEmbeddedUserAgent(request.headers.get('user-agent')),
	})
}
