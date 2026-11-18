import type { Locale as DateFnsLocale } from 'date-fns'
import { formatDistanceToNow } from 'date-fns'
import { enUS, fr } from 'date-fns/locale'

import { currencyCode, DEFAULT_CURRENCY } from '@/lib/i18n/currency'
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/lib/i18n/locales'
import { getLocale } from '@/paraglide/runtime.js'

// Locale-aware formatting for anything shown to a person (plan 36b). Dates,
// numbers and "3 days ago" all go through here so they follow the language
// the page renders in, on the server and in the browser alike. Passing no
// locale uses the current one; code with no request (emails, cron) passes the
// recipient's.
//
// Not for logic: code that takes a date apart to compute with it (see
// lib/calendar-day.ts, lib/cron/schedule-zone.ts) pins 'en-US' on purpose.

// The regional tag each locale formats with. English stays US English, which
// is what every date and number in the app used before localization.
const INTL_TAG: Record<Locale, string> = { en: 'en-US', fr: 'fr-FR' }

const DATE_FNS_LOCALE: Record<Locale, DateFnsLocale> = { en: enUS, fr }

type DateInput = Date | string | number

export function currentLocale(): Locale {
	const locale = getLocale()
	return isLocale(locale) ? locale : DEFAULT_LOCALE
}

export function intlTag(locale: Locale = currentLocale()): string {
	return INTL_TAG[locale]
}

// For libraries that take a date-fns locale (date-fns itself, the calendar).
export function dateFnsLocale(locale: Locale = currentLocale()): DateFnsLocale {
	return DATE_FNS_LOCALE[locale]
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>()
const numberFormatters = new Map<string, Intl.NumberFormat>()
const relativeFormatters = new Map<string, Intl.RelativeTimeFormat>()
const listFormatters = new Map<string, Intl.ListFormat>()

function cached<T>(cache: Map<string, T>, key: string, make: () => T): T {
	let formatter = cache.get(key)
	if (!formatter) {
		formatter = make()
		cache.set(key, formatter)
	}
	return formatter
}

// An instant, shown in the time zone of whoever is rendering it (the viewer
// in a browser, the server during SSR) unless `options.timeZone` says
// otherwise. Returns '' for a value that is not a date.
export function formatDate(value: DateInput, options: Intl.DateTimeFormatOptions, locale: Locale = currentLocale()): string {
	const date = value instanceof Date ? value : new Date(value)
	if (Number.isNaN(date.getTime())) return ''
	const tag = INTL_TAG[locale]
	return cached(dateFormatters, `${tag}|${JSON.stringify(options)}`, () => new Intl.DateTimeFormat(tag, options)).format(date)
}

// A calendar date (a birthday, a holiday, a release day), stored as UTC
// midnight of that date. Formatted in UTC so it never slips to the day
// before for a viewer west of Greenwich.
export function formatCalendarDate(value: DateInput, options: Intl.DateTimeFormatOptions, locale: Locale = currentLocale()): string {
	return formatDate(value, { ...options, timeZone: 'UTC' }, locale)
}

export function formatNumber(value: number, options: Intl.NumberFormatOptions = {}, locale: Locale = currentLocale()): string {
	const tag = INTL_TAG[locale]
	return cached(numberFormatters, `${tag}|${JSON.stringify(options)}`, () => new Intl.NumberFormat(tag, options)).format(value)
}

// "yesterday", "in 2 hours": for callers that pick the unit themselves.
export function relativeTimeFormat(locale: Locale = currentLocale()): Intl.RelativeTimeFormat {
	const tag = INTL_TAG[locale]
	return cached(relativeFormatters, tag, () => new Intl.RelativeTimeFormat(tag, { numeric: 'auto' }))
}

// "about 3 hours ago", "in 2 days".
export function formatTimeAgo(value: DateInput, locale: Locale = currentLocale()): string {
	const date = value instanceof Date ? value : new Date(value)
	if (Number.isNaN(date.getTime())) return ''
	return formatDistanceToNow(date, { addSuffix: true, locale: DATE_FNS_LOCALE[locale] })
}

// "A, B, and C" / "A, B et C": a list inside a sentence. For people's names
// in gift attribution use `formatGifterNames`, which has its own style.
export function formatList(
	items: ReadonlyArray<string>,
	type: Intl.ListFormatType = 'conjunction',
	locale: Locale = currentLocale()
): string {
	const tag = INTL_TAG[locale]
	return cached(listFormatters, `${tag}|${type}`, () => new Intl.ListFormat(tag, { style: 'long', type })).format(items)
}

// ---------------------------------------------------------------------------
// Money (plan 36f)
// ---------------------------------------------------------------------------

type CurrencyOptions = {
	// Drop the decimals from a round amount: "$25" rather than "$25.00". For
	// price bands, axis ticks and prices typed without cents.
	wholeWhenRound?: boolean
}

// "$12.50", "12,50 €". The symbol and where it sits follow the locale, the
// currency is whatever the amount is in. An unknown code falls back to the
// number with the code after it rather than throwing.
export function formatCurrency(
	amount: number,
	currency: string | null | undefined = DEFAULT_CURRENCY,
	options: CurrencyOptions = {},
	locale: Locale = currentLocale()
): string {
	const whole = options.wholeWhenRound === true && Number.isInteger(amount)
	const digits = whole ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}
	const code = currencyCode(currency)
	if (code) {
		try {
			return formatNumber(amount, { style: 'currency', currency: code, ...digits }, locale)
		} catch {
			// Three letters that are not a currency Intl knows: fall through.
		}
	}
	const plain = formatNumber(amount, whole ? digits : { minimumFractionDigits: 2, maximumFractionDigits: 2 }, locale)
	const label = currency?.trim()
	return label ? `${plain} ${label}` : plain
}

// The symbol shown beside an amount field: "$", "€". Falls back to the code.
export function currencySymbol(currency: string | null | undefined = DEFAULT_CURRENCY, locale: Locale = currentLocale()): string {
	const code = currencyCode(currency)
	if (!code) return currency?.trim() ?? ''
	try {
		const tag = INTL_TAG[locale]
		const formatter = cached(
			numberFormatters,
			`${tag}|symbol|${code}`,
			() => new Intl.NumberFormat(tag, { style: 'currency', currency: code })
		)
		return formatter.formatToParts(0).find(part => part.type === 'currency')?.value ?? code
	} catch {
		return code
	}
}

// The number in a typed amount: "12.50" and "12,50" are both 12.5. Null for
// anything that is not a plain amount ("12 each", "45-60", "1,200").
export function parseAmount(raw: string | null | undefined): number | null {
	const text = raw?.trim() ?? ''
	if (!/^\d+(?:\.\d+|,\d{1,2})?$/.test(text)) return null
	return Number(text.replace(',', '.'))
}

// What a typed amount is stored as: a comma decimal becomes a point, so
// "12,50" is saved as "12.50". Anything else comes back trimmed and unchanged.
export function normalizeAmountInput(raw: string): string {
	const text = raw.trim()
	return /^\d+,\d{1,2}$/.test(text) ? text.replace(',', '.') : text
}

// An item's price for display. Prices are free text: a plain amount is shown
// as money in the item's currency (or `fallbackCurrency` when it has none),
// anything else ("12 each", "$45-60") is shown as typed.
export function formatItemPrice(
	price: string,
	currency: string | null | undefined,
	fallbackCurrency: string = DEFAULT_CURRENCY,
	locale: Locale = currentLocale()
): string {
	const amount = parseAmount(price)
	if (amount === null) return price.trim()
	return formatCurrency(amount, currencyCode(currency) ?? fallbackCurrency, { wholeWhenRound: true }, locale)
}
