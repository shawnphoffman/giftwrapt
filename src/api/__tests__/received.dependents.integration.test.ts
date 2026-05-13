// Integration coverage for the per-dependent sections of
// `getReceivedGiftsImpl`. The recipient (a guardian) sees:
//  - their own received gifts (lists they own with subjectDependentId
//    NULL) at the top
//  - one collapsible section per dependent they guard, scoped to that
//    dependent's archived gifts
// Spoiler protection still applies: only items where `isArchived = true`
// are visible.

import { makeDependent, makeDependentGuardianship, makeGiftedItem, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { getReceivedGiftsImpl } from '@/api/received'
import { items } from '@/db/schema'

describe('getReceivedGiftsImpl - dependent sections', () => {
	it('groups archived items on dependent-subject lists into per-dependent sections', async () => {
		await withRollback(async tx => {
			const alice = await makeUser(tx, { name: 'Alice' })
			const gifter = await makeUser(tx, { name: 'Gifter' })
			const mochi = await makeDependent(tx, { name: 'Mochi', createdByUserId: alice.id })
			await makeDependentGuardianship(tx, { guardianUserId: alice.id, dependentId: mochi.id })

			// One personal list (Alice's own), one for Mochi.
			const aliceList = await makeList(tx, { ownerId: alice.id })
			const mochiList = await makeList(tx, { ownerId: alice.id, subjectDependentId: mochi.id })

			// Personal: one archived (visible), one not (hidden by spoiler protection).
			const personalArchived = await makeItem(tx, { listId: aliceList.id, title: 'Knife block' })
			await tx.update(items).set({ isArchived: true }).where(eq(items.id, personalArchived.id))
			await makeGiftedItem(tx, { itemId: personalArchived.id, gifterId: gifter.id })

			const personalNotArchived = await makeItem(tx, { listId: aliceList.id, title: 'Espresso machine' })
			await makeGiftedItem(tx, { itemId: personalNotArchived.id, gifterId: gifter.id })

			// Mochi: one archived (visible in section), one not.
			const mochiArchived = await makeItem(tx, { listId: mochiList.id, title: 'Salmon treats' })
			await tx.update(items).set({ isArchived: true }).where(eq(items.id, mochiArchived.id))
			await makeGiftedItem(tx, { itemId: mochiArchived.id, gifterId: gifter.id })

			const mochiNotArchived = await makeItem(tx, { listId: mochiList.id, title: 'New collar' })
			await makeGiftedItem(tx, { itemId: mochiNotArchived.id, gifterId: gifter.id })

			const result = await getReceivedGiftsImpl({ userId: alice.id, dbx: tx })

			// Top-level personal section: only the archived item.
			expect(result.gifts.map(g => g.itemTitle)).toEqual(['Knife block'])

			// One per-dependent section, with the archived Mochi item.
			expect(result.dependents).toHaveLength(1)
			const mochiSection = result.dependents[0]
			expect(mochiSection.dependent.id).toBe(mochi.id)
			expect(mochiSection.dependent.name).toBe('Mochi')
			expect(mochiSection.gifts.map(g => g.itemTitle)).toEqual(['Salmon treats'])
		})
	})

	it("does not include lists the caller doesn't guard", async () => {
		await withRollback(async tx => {
			const alice = await makeUser(tx)
			const stranger = await makeUser(tx)
			const gifter = await makeUser(tx)

			// Stranger's dependent - alice is not a guardian.
			const strangerDep = await makeDependent(tx, { createdByUserId: stranger.id })
			await makeDependentGuardianship(tx, { guardianUserId: stranger.id, dependentId: strangerDep.id })
			const strangerList = await makeList(tx, { ownerId: stranger.id, subjectDependentId: strangerDep.id })
			const item = await makeItem(tx, { listId: strangerList.id })
			await tx.update(items).set({ isArchived: true }).where(eq(items.id, item.id))
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const result = await getReceivedGiftsImpl({ userId: alice.id, dbx: tx })
			expect(result.gifts).toEqual([])
			expect(result.addons).toEqual([])
			expect(result.dependents).toEqual([])
		})
	})

	it("drops sections that have no archived gifts or addons (no empty 'Mochi' header)", async () => {
		await withRollback(async tx => {
			const alice = await makeUser(tx)
			const gifter = await makeUser(tx)
			const mochi = await makeDependent(tx, { name: 'Mochi', createdByUserId: alice.id })
			await makeDependentGuardianship(tx, { guardianUserId: alice.id, dependentId: mochi.id })
			const mochiList = await makeList(tx, { ownerId: alice.id, subjectDependentId: mochi.id })

			// One claim that has NOT been revealed (item not archived).
			const item = await makeItem(tx, { listId: mochiList.id })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const result = await getReceivedGiftsImpl({ userId: alice.id, dbx: tx })
			expect(result.dependents).toEqual([])
		})
	})

	it('credits both partners on the gifter side for items received by a dependent', async () => {
		await withRollback(async tx => {
			const alice = await makeUser(tx, { name: 'Alice' })
			const gifter = await makeUser(tx, { name: 'Gifter Primary' })
			const gifterPartner = await makeUser(tx, { name: 'Gifter Partner' })
			// Make them partners (single direction is enough for the
			// gifter-resolution logic).
			await tx
				.update(await import('@/db/schema').then(m => m.users))
				.set({ partnerId: gifterPartner.id })
				.where(eq((await import('@/db/schema').then(m => m.users)).id, gifter.id))

			const mochi = await makeDependent(tx, { name: 'Mochi', createdByUserId: alice.id })
			await makeDependentGuardianship(tx, { guardianUserId: alice.id, dependentId: mochi.id })
			const list = await makeList(tx, { ownerId: alice.id, subjectDependentId: mochi.id })
			const item = await makeItem(tx, { listId: list.id, title: 'Salmon treats' })
			await tx.update(items).set({ isArchived: true }).where(eq(items.id, item.id))
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const result = await getReceivedGiftsImpl({ userId: alice.id, dbx: tx })
			const gifts = result.dependents[0]?.gifts ?? []
			expect(gifts).toHaveLength(1)
			// The gifterNames list includes both the primary gifter and the
			// partner, matching the cross-partner credit promise.
			expect(gifts[0].gifterNames).toEqual(expect.arrayContaining(['Gifter Primary', 'Gifter Partner']))
		})
	})
})
