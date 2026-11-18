import { makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { updateUserLocaleImpl } from '@/api/_user-locale-impl'
import { users } from '@/db/schema'

describe('updateUserLocaleImpl', () => {
	it('stores an offered locale and clears it again', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx, { name: 'Sam' })
			const read = async () => (await tx.select({ locale: users.locale }).from(users).where(eq(users.id, user.id)))[0].locale

			expect(await read()).toBeNull()

			expect(await updateUserLocaleImpl({ userId: user.id, locale: 'en', dbx: tx })).toEqual({ kind: 'ok', locale: 'en' })
			expect(await read()).toBe('en')

			expect(await updateUserLocaleImpl({ userId: user.id, locale: null, dbx: tx })).toEqual({ kind: 'ok', locale: null })
			expect(await read()).toBeNull()
		})
	})

	it('refuses a locale that is not offered and leaves the row alone', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx, { name: 'Sam' })
			await updateUserLocaleImpl({ userId: user.id, locale: 'en', dbx: tx })

			// French has a catalog but is not offered until its translation ships.
			for (const locale of ['fr', 'de', 'en-US', '']) {
				expect(await updateUserLocaleImpl({ userId: user.id, locale, dbx: tx })).toEqual({ kind: 'error', reason: 'unknown-locale' })
			}
			const [row] = await tx.select({ locale: users.locale }).from(users).where(eq(users.id, user.id))
			expect(row.locale).toBe('en')
		})
	})

	it("changes only the caller's row", async () => {
		await withRollback(async tx => {
			const a = await makeUser(tx, { name: 'A' })
			const b = await makeUser(tx, { name: 'B' })
			await updateUserLocaleImpl({ userId: a.id, locale: 'en', dbx: tx })
			const [row] = await tx.select({ locale: users.locale }).from(users).where(eq(users.id, b.id))
			expect(row.locale).toBeNull()
		})
	})
})
