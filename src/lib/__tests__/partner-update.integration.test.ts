import { makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { users } from '@/db/schema'
import { applyPartnerAndAnniversary } from '@/lib/partner-update'

async function readPair(tx: Parameters<Parameters<typeof withRollback>[0]>[0], aId: string, bId: string) {
	const rows = await tx.select().from(users).where(eq(users.id, aId))
	const rowsB = await tx.select().from(users).where(eq(users.id, bId))
	return { a: rows[0], b: rowsB[0] }
}

describe('applyPartnerAndAnniversary', () => {
	it('sets partner and anniversary bidirectionally', async () => {
		await withRollback(async tx => {
			const a = await makeUser(tx)
			const b = await makeUser(tx)

			const { selfUpdates } = await applyPartnerAndAnniversary(tx, {
				userId: a.id,
				currentPartnerId: null,
				newPartnerId: b.id,
				newAnniversary: '2020-06-14',
			})
			expect(selfUpdates).toEqual({ partnerId: b.id, partnerAnniversary: '2020-06-14' })
			await tx.update(users).set(selfUpdates).where(eq(users.id, a.id))

			const pair = await readPair(tx, a.id, b.id)
			expect(pair.a.partnerId).toBe(b.id)
			expect(pair.a.partnerAnniversary).toBe('2020-06-14')
			expect(pair.b.partnerId).toBe(a.id)
			expect(pair.b.partnerAnniversary).toBe('2020-06-14')
		})
	})

	it('updates anniversary on both rows when only the anniversary changes', async () => {
		await withRollback(async tx => {
			const a = await makeUser(tx)
			const b = await makeUser(tx, { partnerId: '' })
			await tx.update(users).set({ partnerId: b.id, partnerAnniversary: '2020-01-01' }).where(eq(users.id, a.id))
			await tx.update(users).set({ partnerId: a.id, partnerAnniversary: '2020-01-01' }).where(eq(users.id, b.id))

			const { selfUpdates } = await applyPartnerAndAnniversary(tx, {
				userId: a.id,
				currentPartnerId: b.id,
				newPartnerId: undefined,
				newAnniversary: '2024-12-31',
			})
			expect(selfUpdates).toEqual({ partnerAnniversary: '2024-12-31' })
			await tx.update(users).set(selfUpdates).where(eq(users.id, a.id))

			const pair = await readPair(tx, a.id, b.id)
			expect(pair.a.partnerAnniversary).toBe('2024-12-31')
			expect(pair.b.partnerAnniversary).toBe('2024-12-31')
		})
	})

	it('clears anniversary on both rows when partner is cleared', async () => {
		await withRollback(async tx => {
			const a = await makeUser(tx)
			const b = await makeUser(tx)
			await tx.update(users).set({ partnerId: b.id, partnerAnniversary: '2020-06-14' }).where(eq(users.id, a.id))
			await tx.update(users).set({ partnerId: a.id, partnerAnniversary: '2020-06-14' }).where(eq(users.id, b.id))

			const { selfUpdates } = await applyPartnerAndAnniversary(tx, {
				userId: a.id,
				currentPartnerId: b.id,
				newPartnerId: null,
				newAnniversary: undefined,
			})
			expect(selfUpdates).toEqual({ partnerId: null, partnerAnniversary: null })
			await tx.update(users).set(selfUpdates).where(eq(users.id, a.id))

			const pair = await readPair(tx, a.id, b.id)
			expect(pair.a.partnerId).toBeNull()
			expect(pair.a.partnerAnniversary).toBeNull()
			expect(pair.b.partnerId).toBeNull()
			expect(pair.b.partnerAnniversary).toBeNull()
		})
	})

	it('clears anniversary submitted alongside no partner', async () => {
		// User has no partner and submits an anniversary string. The
		// server-side guard forces it back to null so we never persist a
		// dangling anniversary.
		await withRollback(async tx => {
			const a = await makeUser(tx)

			const { selfUpdates } = await applyPartnerAndAnniversary(tx, {
				userId: a.id,
				currentPartnerId: null,
				newPartnerId: undefined,
				newAnniversary: '2024-01-01',
			})
			expect(selfUpdates).toEqual({ partnerAnniversary: null })
		})
	})

	it('switches partner: old partner is unlinked and anniversary moves to new pair', async () => {
		await withRollback(async tx => {
			const a = await makeUser(tx)
			const oldPartner = await makeUser(tx)
			const newPartner = await makeUser(tx)
			await tx.update(users).set({ partnerId: oldPartner.id, partnerAnniversary: '2018-05-05' }).where(eq(users.id, a.id))
			await tx.update(users).set({ partnerId: a.id, partnerAnniversary: '2018-05-05' }).where(eq(users.id, oldPartner.id))

			const { selfUpdates } = await applyPartnerAndAnniversary(tx, {
				userId: a.id,
				currentPartnerId: oldPartner.id,
				newPartnerId: newPartner.id,
				newAnniversary: '2024-08-20',
			})
			await tx.update(users).set(selfUpdates).where(eq(users.id, a.id))

			const oldRow = (await tx.select().from(users).where(eq(users.id, oldPartner.id)))[0]
			expect(oldRow.partnerId).toBeNull()
			expect(oldRow.partnerAnniversary).toBeNull()

			const newRow = (await tx.select().from(users).where(eq(users.id, newPartner.id)))[0]
			expect(newRow.partnerId).toBe(a.id)
			expect(newRow.partnerAnniversary).toBe('2024-08-20')

			const aRow = (await tx.select().from(users).where(eq(users.id, a.id)))[0]
			expect(aRow.partnerId).toBe(newPartner.id)
			expect(aRow.partnerAnniversary).toBe('2024-08-20')
		})
	})

	it('stealing a partner from a third user clears their anniversary too', async () => {
		await withRollback(async tx => {
			const a = await makeUser(tx)
			const target = await makeUser(tx)
			const thirdParty = await makeUser(tx)
			// target is currently partnered with thirdParty
			await tx.update(users).set({ partnerId: thirdParty.id, partnerAnniversary: '2019-09-09' }).where(eq(users.id, target.id))
			await tx.update(users).set({ partnerId: target.id, partnerAnniversary: '2019-09-09' }).where(eq(users.id, thirdParty.id))

			const { selfUpdates } = await applyPartnerAndAnniversary(tx, {
				userId: a.id,
				currentPartnerId: null,
				newPartnerId: target.id,
				newAnniversary: null,
			})
			await tx.update(users).set(selfUpdates).where(eq(users.id, a.id))

			const thirdRow = (await tx.select().from(users).where(eq(users.id, thirdParty.id)))[0]
			expect(thirdRow.partnerId).toBeNull()
			expect(thirdRow.partnerAnniversary).toBeNull()

			const targetRow = (await tx.select().from(users).where(eq(users.id, target.id)))[0]
			expect(targetRow.partnerId).toBe(a.id)
			expect(targetRow.partnerAnniversary).toBeNull()
		})
	})

	it('leaves anniversary untouched when neither partner nor anniversary submitted', async () => {
		await withRollback(async tx => {
			const a = await makeUser(tx)
			const b = await makeUser(tx)
			await tx.update(users).set({ partnerId: b.id, partnerAnniversary: '2020-06-14' }).where(eq(users.id, a.id))
			await tx.update(users).set({ partnerId: a.id, partnerAnniversary: '2020-06-14' }).where(eq(users.id, b.id))

			const { selfUpdates } = await applyPartnerAndAnniversary(tx, {
				userId: a.id,
				currentPartnerId: b.id,
				newPartnerId: undefined,
				newAnniversary: undefined,
			})
			expect(selfUpdates).toEqual({})

			const aRow = (await tx.select().from(users).where(eq(users.id, a.id)))[0]
			expect(aRow.partnerAnniversary).toBe('2020-06-14')
		})
	})
})
