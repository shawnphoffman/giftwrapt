import type { z } from 'zod'
import { en, fr } from 'zod/locales'

import { currentLocale } from '@/lib/i18n/format'
import type { Locale } from '@/lib/i18n/locales'

// Validation messages in the reader's language (plan 36e).
//
// A schema check that names its own message (`.min(1, m.name_required())`)
// shows that. A check that names none falls back to zod's stock wording, and
// which language that is in is decided here, per parse. zod's global
// `z.config()` is not used: it is one setting for the whole process, which on
// a server would put every request in the language of the last one to set it.
const STOCK_MESSAGES: Record<Locale, z.core.$ZodErrorMap> = {
	en: en().localeError,
	fr: fr().localeError,
}

/** Second argument for `schema.safeParse(value, zodParams())`. */
export function zodParams(locale: Locale = currentLocale()): { error: z.core.$ZodErrorMap } {
	return { error: STOCK_MESSAGES[locale] }
}

/** One line of text for a failed parse, for forms that show a single alert. */
export function zodIssuesText(error: z.ZodError): string {
	return [...new Set(error.issues.map(issue => issue.message))].join(', ')
}
