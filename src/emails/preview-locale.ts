import type { Locale } from '../lib/i18n/locales'

// The language the react-email preview (`pnpm dev-email`) writes the sample
// emails in. English unless asked: `EMAIL_PREVIEW_LOCALE=fr pnpm dev-email`.
// Only the templates' PreviewProps read this; real sends pass the
// recipient's language.
export const previewLocale: Locale = process.env.EMAIL_PREVIEW_LOCALE === 'fr' ? 'fr' : 'en'
