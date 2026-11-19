import { DEFAULT_LOCALE, type Locale, matchLocale } from '@/lib/i18n/locales'

// The language to write to someone who is not making the request, i.e. the
// recipient of an email (plan 36g).

/** `users.locale` as stored: a language the person picked, or null. */
export type StoredLocale = string | null | undefined

// Their own choice when it is a language this deployment offers, else the
// deployment default (the `defaultLocale` app setting). A guardian's copy of
// a child's email is resolved from the guardian's row, so it is written in
// the guardian's language.
export function recipientLocale(stored: StoredLocale, defaultLocale: string | null | undefined): Locale {
	return matchLocale(stored) ?? matchLocale(defaultLocale) ?? DEFAULT_LOCALE
}
