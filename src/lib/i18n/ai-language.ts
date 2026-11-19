import type { Locale } from '@/lib/i18n/locales'

// A line for an AI prompt that asks for the answer in the reader's language
// (plan 36h). Goes at the end of the user prompt, never in the system block,
// so the system prefix stays identical across languages and keeps hitting
// the provider's prompt cache.
//
// English returns nothing: the prompts are written in English and models
// already answer in kind, so English requests are byte-for-byte what they
// were.

const LANGUAGE_NAME: Record<Locale, string> = { en: 'English', fr: 'French (français)' }

/** The language's name as written in a prompt. */
export function outputLanguageName(locale: Locale): string {
	return LANGUAGE_NAME[locale]
}

export function outputLanguageInstruction(locale: Locale): string {
	if (locale === 'en') return ''
	return `\n\nWrite every sentence you return in ${LANGUAGE_NAME[locale]}. Address the reader formally. Keep names, list names, product titles and any quoted text exactly as given; do not translate them.`
}
