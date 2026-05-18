import { makeGiftedItem, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { updateItemGiftImpl } from '@/api/_gifts-impl'
import { giftedItems } from '@/db/schema'

describe('updateItemGiftImpl - tracking number', () => {
	it('persists trackingNumber on update', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const gift = await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const result = await updateItemGiftImpl({
				gifterId: gifter.id,
				input: { giftId: gift.id, quantity: gift.quantity, totalCost: undefined, trackingNumber: '1Z999AA10123456784' },
				dbx: tx,
			})
			expect(result.kind).toBe('ok')

			const row = await tx.query.giftedItems.findFirst({ where: eq(giftedItems.id, gift.id) })
			expect(row?.trackingNumber).toBe('1Z999AA10123456784')
		})
	})

	it('clears trackingNumber when explicitly set to null', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const gift = await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			// Set then clear.
			await updateItemGiftImpl({
				gifterId: gifter.id,
				input: { giftId: gift.id, quantity: gift.quantity, totalCost: undefined, trackingNumber: 'abc-123' },
				dbx: tx,
			})
			const result = await updateItemGiftImpl({
				gifterId: gifter.id,
				input: { giftId: gift.id, quantity: gift.quantity, totalCost: undefined, trackingNumber: null },
				dbx: tx,
			})
			expect(result.kind).toBe('ok')

			const row = await tx.query.giftedItems.findFirst({ where: eq(giftedItems.id, gift.id) })
			expect(row?.trackingNumber).toBeNull()
		})
	})

	it('leaves trackingNumber unchanged when not provided', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const gift = await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			// Set initially.
			await updateItemGiftImpl({
				gifterId: gifter.id,
				input: { giftId: gift.id, quantity: gift.quantity, totalCost: undefined, trackingNumber: 'XYZ' },
				dbx: tx,
			})

			// Update something else - tracking should survive.
			await updateItemGiftImpl({
				gifterId: gifter.id,
				input: { giftId: gift.id, quantity: gift.quantity, totalCost: undefined, notes: 'edited' },
				dbx: tx,
			})

			const row = await tx.query.giftedItems.findFirst({ where: eq(giftedItems.id, gift.id) })
			expect(row?.trackingNumber).toBe('XYZ')
			expect(row?.notes).toBe('edited')
		})
	})
})
