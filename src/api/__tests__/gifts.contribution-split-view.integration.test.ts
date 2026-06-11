import { makeGiftedItem, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { getContributionSplitImpl, setContributionSplitImpl } from '@/api/_gifts-impl'

describe('getContributionSplitImpl', () => {
	it('returns co-gifters with the even-split default when no custom split is set', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { name: 'Owner' })
			const primary = await makeUser(tx, { name: 'Primary' })
			const co = await makeUser(tx, { name: 'Co' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const gift = await makeGiftedItem(tx, { itemId: item.id, gifterId: primary.id, additionalGifterIds: [co.id], totalCost: '110.00' })

			const view = await getContributionSplitImpl({ callerId: primary.id, giftId: gift.id, dbx: tx })
			expect(view?.totalCost).toBe('110.00')
			expect(view?.coGifters).toHaveLength(1)
			expect(view?.coGifters[0].id).toBe(co.id)
			// Even default: $110 over 2 units (primary + co) -> $55 each.
			expect(view?.coGifters[0].amount).toBe('55.00')
		})
	})

	it('returns the stored custom amount when a split is set', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { name: 'Owner' })
			const primary = await makeUser(tx, { name: 'Primary' })
			const co = await makeUser(tx, { name: 'Co' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const gift = await makeGiftedItem(tx, { itemId: item.id, gifterId: primary.id, additionalGifterIds: [co.id], totalCost: '110.00' })
			await setContributionSplitImpl({
				actorId: primary.id,
				input: { giftId: gift.id, coGifters: [{ userId: co.id, amount: '40.00' }] },
				dbx: tx,
			})

			const view = await getContributionSplitImpl({ callerId: primary.id, giftId: gift.id, dbx: tx })
			expect(Number(view?.coGifters[0].amount)).toBe(40)
		})
	})

	it('returns null for a viewer who is neither the primary nor their partner', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { name: 'Owner' })
			const primary = await makeUser(tx, { name: 'Primary' })
			const co = await makeUser(tx, { name: 'Co' })
			const stranger = await makeUser(tx, { name: 'Stranger' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const gift = await makeGiftedItem(tx, { itemId: item.id, gifterId: primary.id, additionalGifterIds: [co.id], totalCost: '110.00' })

			expect(await getContributionSplitImpl({ callerId: stranger.id, giftId: gift.id, dbx: tx })).toBeNull()
		})
	})
})
