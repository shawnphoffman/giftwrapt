import { db } from '@/db'
import { isEmbeddedUserAgent } from '@/lib/embedded'
import {
	fallbackLocale,
	type Locale,
	LOCALES_ENV,
	matchLocale,
	readLocaleCookie,
	resolveLocale,
	unknownLocaleCodes,
} from '@/lib/i18n/locales'
import { createLogger } from '@/lib/logger'
import { getAppSettings } from '@/lib/settings-loader'

// Server only: resolves the locale of an incoming request (plan 36b).

// Say so once if the operator listed a language there is no catalog for; it
// is ignored rather than failing the boot.
const unknownCodes = unknownLocaleCodes(process.env[LOCALES_ENV])
if (unknownCodes.length > 0) {
	createLogger('i18n').warn({ unknown: unknownCodes, variable: LOCALES_ENV }, 'unknown language codes ignored')
}

// The deployment default is read on every request, so it is cached briefly
// per server instance. An admin's change shows up within a minute.
const DEFAULT_LOCALE_TTL_MS = 60_000
let cachedDefault: { value: Locale; at: number } | null = null

export async function getDefaultLocale(now = Date.now()): Promise<Locale> {
	if (cachedDefault && now - cachedDefault.at < DEFAULT_LOCALE_TTL_MS) return cachedDefault.value
	let value: Locale = fallbackLocale()
	try {
		const settings = await getAppSettings(db)
		value = matchLocale(settings.defaultLocale) ?? fallbackLocale()
	} catch {
		// A database hiccup must not take the request down over a language
		// preference; fall back to the base locale and try again next time.
		return fallbackLocale()
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
