import { makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { users } from '@/db/schema'

import { checkLiveUser } from '../auth'

describe('checkLiveUser', () => {
	it('is live for an existing, unbanned user', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			expect(await checkLiveUser(user.id, tx)).toBe('live')
		})
	})

	it('is missing once the user row is gone', async () => {
		await withRollback(async tx => {
			expect(await checkLiveUser('no-such-user', tx)).toBe('missing')
		})
	})

	it('is banned for a disabled account, so a still-cached cookie stops working', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			await tx.update(users).set({ banned: true }).where(eq(users.id, user.id))
			expect(await checkLiveUser(user.id, tx)).toBe('banned')
		})
	})

	it('is live again once a timed ban has expired', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			await tx
				.update(users)
				.set({ banned: true, banExpires: new Date('2026-01-01T00:00:00Z') })
				.where(eq(users.id, user.id))
			expect(await checkLiveUser(user.id, tx, new Date('2026-10-02T00:00:00Z'))).toBe('live')
		})
	})
})
