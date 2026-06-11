import { makeGiftedItem, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { getAddableCoGiftersImpl, updateCoGiftersImpl } from '@/api/_gifts-impl'

// D6 guard: the recipient (list owner), the primary's own partner, and the
// primary themselves can never be co-gifters. Enforced server-side, with the
// picker (getAddableCoGifters) excluding the same set as defense-in-depth.

describe('updateCoGiftersImpl D6 guard', () => {
	it('rejects the recipient (list owner) as a co-gifter', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { name: 'Owner' })
			const primary = await makeUser(tx, { name: 'Primary' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const gift = await makeGiftedItem(tx, { itemId: item.id, gifterId: primary.id })

			const result = await updateCoGiftersImpl({
				gifterId: primary.id,
				input: { giftId: gift.id, additionalGifterIds: [owner.id] },
				dbx: tx,
			})
			expect(result).toEqual({ kind: 'error', reason: 'not-allowed' })
		})
	})

	it("rejects the primary's own partner as a co-gifter", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { name: 'Owner' })
			const partner = await makeUser(tx, { name: 'Partner' })
			const primary = await makeUser(tx, { name: 'Primary', partnerId: partner.id })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const gift = await makeGiftedItem(tx, { itemId: item.id, gifterId: primary.id })

			const result = await updateCoGiftersImpl({
				gifterId: primary.id,
				input: { giftId: gift.id, additionalGifterIds: [partner.id] },
				dbx: tx,
			})
			expect(result).toEqual({ kind: 'error', reason: 'not-allowed' })
		})
	})

	it('rejects a co-gifter who names the primary as their partner (symmetric)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { name: 'Owner' })
			const primary = await makeUser(tx, { name: 'Primary' })
			const partner = await makeUser(tx, { name: 'Partner', partnerId: primary.id })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const gift = await makeGiftedItem(tx, { itemId: item.id, gifterId: primary.id })

			const result = await updateCoGiftersImpl({
				gifterId: primary.id,
				input: { giftId: gift.id, additionalGifterIds: [partner.id] },
				dbx: tx,
			})
			expect(result).toEqual({ kind: 'error', reason: 'not-allowed' })
		})
	})

	it('allows an unrelated co-gifter', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { name: 'Owner' })
			const primary = await makeUser(tx, { name: 'Primary' })
			const friend = await makeUser(tx, { name: 'Friend' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const gift = await makeGiftedItem(tx, { itemId: item.id, gifterId: primary.id })

			const result = await updateCoGiftersImpl({
				gifterId: primary.id,
				input: { giftId: gift.id, additionalGifterIds: [friend.id] },
				dbx: tx,
			})
			expect(result).toEqual({ kind: 'ok', additionalGifterIds: [friend.id] })
		})
	})
})

describe('getAddableCoGiftersImpl', () => {
	it('excludes the recipient, the caller, and the caller-partner; includes unrelated users', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { name: 'Owner' })
			const partner = await makeUser(tx, { name: 'Partner' })
			const primary = await makeUser(tx, { name: 'Primary', partnerId: partner.id })
			const friend = await makeUser(tx, { name: 'Friend' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const gift = await makeGiftedItem(tx, { itemId: item.id, gifterId: primary.id })

			const addable = await getAddableCoGiftersImpl({ callerId: primary.id, giftId: gift.id, dbx: tx })
			const ids = addable.map(u => u.id)
			expect(ids).toContain(friend.id)
			expect(ids).not.toContain(owner.id)
			expect(ids).not.toContain(partner.id)
			expect(ids).not.toContain(primary.id)
		})
	})

	it('returns [] when the caller is not the primary gifter', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { name: 'Owner' })
			const primary = await makeUser(tx, { name: 'Primary' })
			const other = await makeUser(tx, { name: 'Other' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const gift = await makeGiftedItem(tx, { itemId: item.id, gifterId: primary.id })

			const addable = await getAddableCoGiftersImpl({ callerId: other.id, giftId: gift.id, dbx: tx })
			expect(addable).toEqual([])
		})
	})
})
