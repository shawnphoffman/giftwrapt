import { makeGiftedItem, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { updateItemGiftImpl } from '@/api/_gifts-impl'
import { giftedItems, items } from '@/db/schema'

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

	it('allows editing purchase details after the item is revealed (isArchived)', async () => {
		// Gifter-private fields (totalCost, notes, trackingNumber, attachments)
		// are unrelated to the recipient's reveal state, so editing them must
		// remain possible after items.isArchived flips to true. This also
		// matters for v1 -> v2 migrated data, where the v1 `archived` flag was
		// copied onto items.isArchived with broader semantics.
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, isArchived: true })
			const gift = await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const result = await updateItemGiftImpl({
				gifterId: gifter.id,
				input: { giftId: gift.id, quantity: gift.quantity, totalCost: '42.00', notes: 'late receipt', trackingNumber: 'late-track' },
				dbx: tx,
			})
			expect(result.kind).toBe('ok')

			const row = await tx.query.giftedItems.findFirst({ where: eq(giftedItems.id, gift.id) })
			expect(row?.totalCost).toBe('42.00')
			expect(row?.notes).toBe('late receipt')
			expect(row?.trackingNumber).toBe('late-track')

			// Sanity: the item is still archived; we didn't sneak that off.
			const itemRow = await tx.query.items.findFirst({ where: eq(items.id, item.id) })
			expect(itemRow?.isArchived).toBe(true)
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
