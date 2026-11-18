import type { Locale as DateFnsLocale } from 'date-fns'
import { formatDistanceToNow } from 'date-fns'
import { enUS, fr } from 'date-fns/locale'

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
