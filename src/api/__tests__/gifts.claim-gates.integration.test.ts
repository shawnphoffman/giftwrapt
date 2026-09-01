// Coverage for the claim-gate rejection branches in `_gifts-impl.ts`:
//   - over-claim on claim creation (claimItemGiftImpl)
//   - over-claim on claim edit (updateItemGiftImpl)
//   - `or` group lockout (group-already-claimed)
//   - `order` group sequencing (group-out-of-order)
//   - unavailable items reject new claims
//
// Known limitation (project decision D3): this harness runs on PGlite
// inside a rollback transaction, so true concurrency (two racing claims
// contending on SELECT FOR UPDATE) is structurally untestable here.
// These tests cover the sequential enforcement branches only; a
// real-Postgres opt-in race test is deferred post-v1.

import { makeGiftedItem, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { claimItemGiftImpl, updateItemGiftImpl } from '@/api/_gifts-impl'
import { itemGroups } from '@/db/schema'

describe('claimItemGiftImpl - over-claim gate', () => {
	it('rejects a claim exceeding the remaining quantity (fully claimed item)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const firstGifter = await makeUser(tx)
			const secondGifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, quantity: 2 })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: firstGifter.id, quantity: 2 })

			const result = await claimItemGiftImpl({
				gifterId: secondGifter.id,
				input: { itemId: item.id, quantity: 1, totalCost: undefined },
				dbx: tx,
			})
			expect(result).toEqual({ kind: 'error', reason: 'over-claim', remaining: 0 })
		})
	})

	it('rejects a claim of 2 when only 1 remains, reporting the remainder', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const firstGifter = await makeUser(tx)
			const secondGifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, quantity: 3 })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: firstGifter.id, quantity: 2 })

			const result = await claimItemGiftImpl({
				gifterId: secondGifter.id,
				input: { itemId: item.id, quantity: 2, totalCost: undefined },
				dbx: tx,
			})
			expect(result).toEqual({ kind: 'error', reason: 'over-claim', remaining: 1 })
		})
	})

	it('accepts a claim that exactly consumes the remaining quantity (control)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const firstGifter = await makeUser(tx)
			const secondGifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, quantity: 3 })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: firstGifter.id, quantity: 2 })

			const result = await claimItemGiftImpl({
				gifterId: secondGifter.id,
				input: { itemId: item.id, quantity: 1, totalCost: undefined },
				dbx: tx,
			})
			expect(result.kind).toBe('ok')
			if (result.kind === 'ok') expect(result.gift.quantity).toBe(1)
		})
	})
})

describe('updateItemGiftImpl - over-claim gate on edit', () => {
	it('rejects raising a claim past the quantity left by other claims', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const otherGifter = await makeUser(tx)
			const editor = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, quantity: 3 })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: otherGifter.id, quantity: 1 })
			const myGift = await makeGiftedItem(tx, { itemId: item.id, gifterId: editor.id, quantity: 1 })

			// Other claims hold 1 of 3, so my claim may grow to at most 2.
			const result = await updateItemGiftImpl({
				gifterId: editor.id,
				input: { giftId: myGift.id, quantity: 3, totalCost: null },
				dbx: tx,
			})
			expect(result).toEqual({ kind: 'error', reason: 'over-claim', remaining: 2 })
		})
	})

	it('accepts an edit up to the quantity left by other claims (control)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const otherGifter = await makeUser(tx)
			const editor = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, quantity: 3 })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: otherGifter.id, quantity: 1 })
			const myGift = await makeGiftedItem(tx, { itemId: item.id, gifterId: editor.id, quantity: 1 })

			const result = await updateItemGiftImpl({
				gifterId: editor.id,
				input: { giftId: myGift.id, quantity: 2, totalCost: null },
				dbx: tx,
			})
			expect(result.kind).toBe('ok')
			if (result.kind === 'ok') expect(result.gift.quantity).toBe(2)
		})
	})
})

describe('claimItemGiftImpl - `or` group gate', () => {
	it('rejects a claim on a sibling once any item in the group is claimed', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const firstGifter = await makeUser(tx)
			const secondGifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const [group] = await tx.insert(itemGroups).values({ listId: list.id, type: 'or' }).returning()
			const itemA = await makeItem(tx, { listId: list.id, groupId: group.id, title: 'A' })
			const itemB = await makeItem(tx, { listId: list.id, groupId: group.id, title: 'B' })
			await makeGiftedItem(tx, { itemId: itemA.id, gifterId: firstGifter.id })

			const result = await claimItemGiftImpl({
				gifterId: secondGifter.id,
				input: { itemId: itemB.id, quantity: 1, totalCost: undefined },
				dbx: tx,
			})
			expect(result).toEqual({ kind: 'error', reason: 'group-already-claimed', blockingItemTitle: itemA.title })
		})
	})

	it('accepts the first claim in an unclaimed `or` group (control)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const [group] = await tx.insert(itemGroups).values({ listId: list.id, type: 'or' }).returning()
			const itemA = await makeItem(tx, { listId: list.id, groupId: group.id, title: 'A' })
			await makeItem(tx, { listId: list.id, groupId: group.id, title: 'B' })

			const result = await claimItemGiftImpl({
				gifterId: gifter.id,
				input: { itemId: itemA.id, quantity: 1, totalCost: undefined },
				dbx: tx,
			})
			expect(result.kind).toBe('ok')
		})
	})
})

describe('claimItemGiftImpl - `order` group gate', () => {
	it('rejects claiming item 2 while item 1 still has remaining quantity', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const [group] = await tx.insert(itemGroups).values({ listId: list.id, type: 'order' }).returning()
			const first = await makeItem(tx, { listId: list.id, groupId: group.id, groupSortOrder: 0, title: 'first' })
			const second = await makeItem(tx, { listId: list.id, groupId: group.id, groupSortOrder: 1, title: 'second' })

			const result = await claimItemGiftImpl({
				gifterId: gifter.id,
				input: { itemId: second.id, quantity: 1, totalCost: undefined },
				dbx: tx,
			})
			expect(result).toEqual({ kind: 'error', reason: 'group-out-of-order', blockingItemTitle: first.title })
		})
	})

	it('rejects claiming item 2 while item 1 is only partially claimed', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const firstGifter = await makeUser(tx)
			const secondGifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const [group] = await tx.insert(itemGroups).values({ listId: list.id, type: 'order' }).returning()
			const first = await makeItem(tx, { listId: list.id, groupId: group.id, groupSortOrder: 0, quantity: 2, title: 'first' })
			const second = await makeItem(tx, { listId: list.id, groupId: group.id, groupSortOrder: 1, title: 'second' })
			// 1 of 2 claimed - the prerequisite is not yet fully consumed.
			await makeGiftedItem(tx, { itemId: first.id, gifterId: firstGifter.id, quantity: 1 })

			const result = await claimItemGiftImpl({
				gifterId: secondGifter.id,
				input: { itemId: second.id, quantity: 1, totalCost: undefined },
				dbx: tx,
			})
			expect(result).toEqual({ kind: 'error', reason: 'group-out-of-order', blockingItemTitle: first.title })
		})
	})

	it('accepts claiming item 2 after item 1 is fully claimed (control)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const firstGifter = await makeUser(tx)
			const secondGifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const [group] = await tx.insert(itemGroups).values({ listId: list.id, type: 'order' }).returning()
			const first = await makeItem(tx, { listId: list.id, groupId: group.id, groupSortOrder: 0, title: 'first' })
			const second = await makeItem(tx, { listId: list.id, groupId: group.id, groupSortOrder: 1, title: 'second' })

			const firstClaim = await claimItemGiftImpl({
				gifterId: firstGifter.id,
				input: { itemId: first.id, quantity: 1, totalCost: undefined },
				dbx: tx,
			})
			expect(firstClaim.kind).toBe('ok')

			const result = await claimItemGiftImpl({
				gifterId: secondGifter.id,
				input: { itemId: second.id, quantity: 1, totalCost: undefined },
				dbx: tx,
			})
			expect(result.kind).toBe('ok')
		})
	})
})

describe('claimItemGiftImpl - unavailable gate', () => {
	it('rejects a claim on an unavailable item', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, availability: 'unavailable' })

			const result = await claimItemGiftImpl({
				gifterId: gifter.id,
				input: { itemId: item.id, quantity: 1, totalCost: undefined },
				dbx: tx,
			})
			expect(result).toEqual({ kind: 'error', reason: 'unavailable' })
		})
	})

	it('accepts a claim on an available item (control)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, availability: 'available' })

			const result = await claimItemGiftImpl({
				gifterId: gifter.id,
				input: { itemId: item.id, quantity: 1, totalCost: undefined },
				dbx: tx,
			})
			expect(result.kind).toBe('ok')
		})
	})
})
