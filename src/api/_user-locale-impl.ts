import { eq } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { users } from '@/db/schema'
import { isReadyLocale, type Locale } from '@/lib/i18n/locales'

export type UpdateUserLocaleResult = { kind: 'ok'; locale: Locale | null } | { kind: 'error'; reason: 'unknown-locale' }

// Stores the language a user chose, or clears it (null) so they follow their
// browser and the deployment default again. Only offered locales are
// accepted; see READY_LOCALES in src/lib/i18n/locales.ts.
export async function updateUserLocaleImpl(args: {
	userId: string
	locale: string | null
	dbx: SchemaDatabase
}): Promise<UpdateUserLocaleResult> {
	const { userId, locale, dbx } = args
	if (locale !== null && !isReadyLocale(locale)) return { kind: 'error', reason: 'unknown-locale' }
	await dbx.update(users).set({ locale }).where(eq(users.id, userId))
	return { kind: 'ok', locale }
}
