// Integration coverage for the canonical gift-credit predicate in
// `getPurchaseSummaryImpl` (docs/logic.md "Gift credit follows partners
// and co-gifters"): a claim counts for the viewer when
//   gifterId IN [viewer, viewer.partnerId]
//   OR additionalGifterIds && [viewer, viewer.partnerId]
// Partner credit is computed at read time from the current
// `users.partnerId`, never denormalized. Also covers the
// recipient-identity swap for dependent-subject lists.

import { makeDependent, makeDependentGuardianship, makeGiftedItem, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { getPurchaseSummaryImpl } from '@/api/_purchases-impl'
import { users } from '@/db/schema'

describe('getPurchaseSummaryImpl - gift credit', () => {
	it('includes a primary claim by the user', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx, { name: 'Me' })
			const owner = await makeUser(tx, { name: 'Owner' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, title: 'Lego Set' })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: me.id })

			const summary = await getPurchaseSummaryImpl(me.id, tx)
			expect(summary.items).toHaveLength(1)
			expect(summary.items[0].title).toBe('Lego Set')
			expect(summary.items[0].isOwn).toBe(true)
			expect(summary.items[0].isCoGifter).toBe(false)
			expect(summary.partner).toBeNull()
		})
	})

	it("includes a claim where the user's partner is the primary gifter (partner credit)", async () => {
		await withRollback(async tx => {
			const partner = await makeUser(tx, { name: 'Partner' })
			const me = await makeUser(tx, { name: 'Me', partnerId: partner.id })
			const owner = await makeUser(tx, { name: 'Owner' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, title: 'Partner Pick' })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: partner.id })

			const summary = await getPurchaseSummaryImpl(me.id, tx)
			expect(summary.items).toHaveLength(1)
			expect(summary.items[0].title).toBe('Partner Pick')
			expect(summary.items[0].isOwn).toBe(false)
			expect(summary.items[0].isPartnerPurchase).toBe(true)
			expect(summary.items[0].isCoGifter).toBe(false)
			expect(summary.partner).toEqual({ name: 'Partner', image: null })
		})
	})

	it('includes a claim by a stranger where the user is a co-gifter', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx, { name: 'Me' })
			const stranger = await makeUser(tx, { name: 'Stranger' })
			const owner = await makeUser(tx, { name: 'Owner' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, title: 'Group Gift' })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: stranger.id, additionalGifterIds: [me.id] })

			const summary = await getPurchaseSummaryImpl(me.id, tx)
			expect(summary.items).toHaveLength(1)
			expect(summary.items[0].title).toBe('Group Gift')
			expect(summary.items[0].isOwn).toBe(false)
			expect(summary.items[0].isCoGifter).toBe(true)
			expect(summary.items[0].hasCoGifters).toBe(true)
		})
	})

	it("includes a claim by a stranger where the user's partner is a co-gifter", async () => {
		await withRollback(async tx => {
			const partner = await makeUser(tx, { name: 'Partner' })
			const me = await makeUser(tx, { name: 'Me', partnerId: partner.id })
			const stranger = await makeUser(tx, { name: 'Stranger' })
			const owner = await makeUser(tx, { name: 'Owner' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, title: 'Partner Co-gift' })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: stranger.id, additionalGifterIds: [partner.id] })

			const summary = await getPurchaseSummaryImpl(me.id, tx)
			expect(summary.items).toHaveLength(1)
			expect(summary.items[0].title).toBe('Partner Co-gift')
			expect(summary.items[0].isOwn).toBe(false)
			expect(summary.items[0].isCoGifter).toBe(true)
		})
	})

	it('excludes a claim by an unrelated stranger', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx, { name: 'Me' })
			const stranger = await makeUser(tx, { name: 'Stranger' })
			const owner = await makeUser(tx, { name: 'Owner' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: stranger.id })

			const summary = await getPurchaseSummaryImpl(me.id, tx)
			expect(summary.items).toEqual([])
		})
	})

	it("drops the partner's claim after unlinking the partner (read-time computation)", async () => {
		await withRollback(async tx => {
			const partner = await makeUser(tx, { name: 'Partner' })
			const me = await makeUser(tx, { name: 'Me', partnerId: partner.id })
			const owner = await makeUser(tx, { name: 'Owner' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, title: 'Partner Pick' })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: partner.id })

			const before = await getPurchaseSummaryImpl(me.id, tx)
			expect(before.items).toHaveLength(1)

			await tx.update(users).set({ partnerId: null }).where(eq(users.id, me.id))

			const after = await getPurchaseSummaryImpl(me.id, tx)
			expect(after.items).toEqual([])
			expect(after.partner).toBeNull()
		})
	})

	it("carries the dependent's identity for claims on a dependent-subject list", async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx, { name: 'Me' })
			const guardian = await makeUser(tx, { name: 'Guardian' })
			const mochi = await makeDependent(tx, { name: 'Mochi', createdByUserId: guardian.id })
			await makeDependentGuardianship(tx, { guardianUserId: guardian.id, dependentId: mochi.id })
			const list = await makeList(tx, { ownerId: guardian.id, subjectDependentId: mochi.id })
			const item = await makeItem(tx, { listId: list.id, title: 'Salmon treats' })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: me.id })

			const summary = await getPurchaseSummaryImpl(me.id, tx)
			expect(summary.items).toHaveLength(1)

			const row = summary.items[0]
			expect(row.recipientKind).toBe('dependent')
			expect(row.subjectDependentId).toBe(mochi.id)
			expect(row.ownerName).toBe('Mochi')
			expect(row.ownerEmail).toBe('')
			// The raw owner id stays the guardian-creator, per the impl contract.
			expect(row.ownerId).toBe(guardian.id)
		})
	})
})
