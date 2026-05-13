import { makeGiftedItem, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { getMyGiftsImpl } from '@/api/_gifts-impl'

describe('getMyGiftsImpl', () => {
	it('returns claims where I am the primary gifter', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx, { name: 'Me' })
			const owner = await makeUser(tx, { name: 'Owner' })
			const list = await makeList(tx, { ownerId: owner.id, name: 'Owner List' })
			const item = await makeItem(tx, { listId: list.id, title: 'Lego Set' })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: me.id, quantity: 1, totalCost: '49.99' })

			const gifts = await getMyGiftsImpl(tx, me.id)
			expect(gifts).toHaveLength(1)

			const g = gifts[0]
			expect(g.itemTitle).toBe('Lego Set')
			expect(g.itemId).toBe(item.id)
			expect(g.quantity).toBe(1)
			expect(g.totalCost).toBe('49.99')
			expect(g.isPrimaryGifter).toBe(true)
			expect(g.isCoGifter).toBe(false)
			expect(g.list).toEqual({
				id: list.id,
				name: 'Owner List',
				ownerId: owner.id,
				ownerName: 'Owner',
				ownerEmail: owner.email,
			})
		})
	})

	it('returns claims where I am only a co-gifter, with isCoGifter true and isPrimaryGifter false', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx, { name: 'Me' })
			const primary = await makeUser(tx, { name: 'Primary' })
			const owner = await makeUser(tx, { name: 'Owner' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, title: 'Co-gift Item' })
			await makeGiftedItem(tx, {
				itemId: item.id,
				gifterId: primary.id,
				additionalGifterIds: [me.id],
			})

			const gifts = await getMyGiftsImpl(tx, me.id)
			expect(gifts).toHaveLength(1)
			expect(gifts[0].isPrimaryGifter).toBe(false)
			expect(gifts[0].isCoGifter).toBe(true)
			expect(gifts[0].additionalGifterIds).toEqual([me.id])
		})
	})

	it('does not return claims I am not part of (neither primary nor co-gifter)', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx, { name: 'Me' })
			const stranger = await makeUser(tx, { name: 'Stranger' })
			const owner = await makeUser(tx, { name: 'Owner' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: stranger.id })

			const gifts = await getMyGiftsImpl(tx, me.id)
			expect(gifts).toHaveLength(0)
		})
	})

	it('does not return claims by my partner (this impl is intentionally narrower than getPurchaseSummary)', async () => {
		await withRollback(async tx => {
			const partner = await makeUser(tx, { name: 'Partner' })
			const me = await makeUser(tx, { name: 'Me', partnerId: partner.id })
			const owner = await makeUser(tx, { name: 'Owner' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: partner.id })

			const gifts = await getMyGiftsImpl(tx, me.id)
			expect(gifts).toHaveLength(0)
		})
	})

	it('orders results newest-first by createdAt', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx, { name: 'Me' })
			const owner = await makeUser(tx, { name: 'Owner' })
			const list = await makeList(tx, { ownerId: owner.id })
			const itemA = await makeItem(tx, { listId: list.id, title: 'First' })
			const itemB = await makeItem(tx, { listId: list.id, title: 'Second' })

			// Set createdAt explicitly: postgres `now()` is constant within a
			// transaction, so two back-to-back inserts inside `withRollback`
			// would share a timestamp and the ordering check would be a coin flip.
			const earlier = new Date('2026-01-01T00:00:00Z')
			const later = new Date('2026-01-02T00:00:00Z')
			await makeGiftedItem(tx, { itemId: itemA.id, gifterId: me.id, createdAt: earlier })
			await makeGiftedItem(tx, { itemId: itemB.id, gifterId: me.id, createdAt: later })

			const gifts = await getMyGiftsImpl(tx, me.id)
			expect(gifts).toHaveLength(2)
			expect(gifts[0].itemTitle).toBe('Second')
			expect(gifts[1].itemTitle).toBe('First')
		})
	})

	it('returns empty array when I have no claims', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx, { name: 'Lonely' })
			const gifts = await getMyGiftsImpl(tx, me.id)
			expect(gifts).toEqual([])
		})
	})
})
