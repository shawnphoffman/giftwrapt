// Currency facts with no dependencies, so `lib/settings.ts` and scripts can
// import them without pulling in the compiled message runtime. Formatting
// lives in `lib/i18n/format.ts`.

// What an amount is in when nothing says otherwise. A deployment overrides it
// with the `defaultCurrency` app setting; this is that setting's default.
export const DEFAULT_CURRENCY = 'USD'

/** A three-letter currency code in upper case, or null if `raw` is not one. */
export function currencyCode(raw: string | null | undefined): string | null {
	const code = raw?.trim().toUpperCase() ?? ''
	return /^[A-Z]{3}$/.test(code) ? code : null
}

// The currencies offered in the admin picker. Any ISO 4217 code is a valid
// setting; this is only the short list a person is likely to want.
export const COMMON_CURRENCIES = [
	'USD',
	'CAD',
	'EUR',
	'GBP',
	'CHF',
	'AUD',
	'NZD',
	'JPY',
	'MXN',
	'BRL',
	'SEK',
	'NOK',
	'DKK',
	'PLN',
	'INR',
] as const
