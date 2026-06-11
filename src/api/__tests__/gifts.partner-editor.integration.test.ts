import { makeGiftedItem, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { unclaimItemGiftImpl, updateItemGiftImpl } from '@/api/_gifts-impl'

// Partner-as-editor: the primary gifter's partner shares the gifter unit, so
// they may edit the claim's metadata (cost / notes / quantity). Unclaim stays
// primary-only.

describe('updateItemGiftImpl partner editing', () => {
	it("lets the primary gifter's partner edit the total cost", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { name: 'Owner' })
			const partner = await makeUser(tx, { name: 'Partner' })
			const primary = await makeUser(tx, { name: 'Primary', partnerId: partner.id })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, quantity: 1 })
			const gift = await makeGiftedItem(tx, { itemId: item.id, gifterId: primary.id, totalCost: '100.00' })

			const result = await updateItemGiftImpl({
				gifterId: partner.id,
				input: { giftId: gift.id, quantity: 1, totalCost: '120.00' },
				dbx: tx,
			})
			expect(result.kind).toBe('ok')
			if (result.kind === 'ok') expect(result.gift.totalCost).toBe('120.00')
		})
	})

	it('resolves the partnership symmetrically (link set on the primary side only)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { name: 'Owner' })
			// Only the primary names the partner; the partner row has no partnerId.
			const partner = await makeUser(tx, { name: 'Partner' })
			const primary = await makeUser(tx, { name: 'Primary', partnerId: partner.id })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, quantity: 1 })
			const gift = await makeGiftedItem(tx, { itemId: item.id, gifterId: primary.id, totalCost: '50.00' })

			const result = await updateItemGiftImpl({
				gifterId: partner.id,
				input: { giftId: gift.id, quantity: 1, totalCost: '60.00' },
				dbx: tx,
			})
			expect(result.kind).toBe('ok')
		})
	})

	it('rejects an unrelated user editing the claim', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { name: 'Owner' })
			const primary = await makeUser(tx, { name: 'Primary' })
			const stranger = await makeUser(tx, { name: 'Stranger' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, quantity: 1 })
			const gift = await makeGiftedItem(tx, { itemId: item.id, gifterId: primary.id })

			const result = await updateItemGiftImpl({
				gifterId: stranger.id,
				input: { giftId: gift.id, quantity: 1, totalCost: '10.00' },
				dbx: tx,
			})
			expect(result).toEqual({ kind: 'error', reason: 'not-yours' })
		})
	})

	it('keeps unclaim primary-only: the partner cannot unclaim', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { name: 'Owner' })
			const partner = await makeUser(tx, { name: 'Partner' })
			const primary = await makeUser(tx, { name: 'Primary', partnerId: partner.id })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, quantity: 1 })
			const gift = await makeGiftedItem(tx, { itemId: item.id, gifterId: primary.id })

			const result = await unclaimItemGiftImpl({ gifterId: partner.id, input: { giftId: gift.id }, dbx: tx })
			expect(result).toEqual({ kind: 'error', reason: 'not-yours' })
		})
	})
})
