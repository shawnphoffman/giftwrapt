// Coverage for pending-deletion interactions in `claimItemGiftImpl`:
//   - claim attempts on a pending-deletion item are rejected as item-not-found
//   - `or` group siblings are unblocked when the previously-claimed item
//     flipped to pending-deletion (the gate skips it)
//   - `order` group prerequisites are skipped for pending-deletion items

import { makeGiftedItem, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { claimItemGiftImpl } from '@/api/_gifts-impl'
import { itemGroups, items } from '@/db/schema'

const PENDING = new Date('2026-05-13T00:00:00Z')

describe('claimItemGiftImpl - pending-deletion interactions', () => {
	it('rejects a new claim on a pending-deletion item', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, pendingDeletionAt: PENDING })

			const result = await claimItemGiftImpl({
				gifterId: gifter.id,
				input: { itemId: item.id, quantity: 1, totalCost: undefined },
				dbx: tx,
			})
			expect(result).toEqual({ kind: 'error', reason: 'item-not-found' })
		})
	})

	it("`or` group: a pending-deletion sibling's claim does NOT lock other siblings", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const claimer = await makeUser(tx)
			const newGifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const [group] = await tx.insert(itemGroups).values({ listId: list.id, type: 'or' }).returning()
			const original = await makeItem(tx, { listId: list.id, groupId: group.id, title: 'A' })
			const sibling = await makeItem(tx, { listId: list.id, groupId: group.id, title: 'B' })
			// Claim A, then flip A to pending-deletion. Without the gate
			// fix, claiming B would now fail with group-already-claimed.
			await makeGiftedItem(tx, { itemId: original.id, gifterId: claimer.id })
			await tx.update(items).set({ pendingDeletionAt: PENDING }).where(eq(items.id, original.id))

			const result = await claimItemGiftImpl({
				gifterId: newGifter.id,
				input: { itemId: sibling.id, quantity: 1, totalCost: undefined },
				dbx: tx,
			})
			expect(result.kind).toBe('ok')
		})
	})

	it('`order` group: a pending-deletion earlier item does NOT block later items', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const newGifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const [group] = await tx.insert(itemGroups).values({ listId: list.id, type: 'order' }).returning()
			const earlier = await makeItem(tx, {
				listId: list.id,
				groupId: group.id,
				groupSortOrder: 0,
				title: 'first',
			})
			const later = await makeItem(tx, {
				listId: list.id,
				groupId: group.id,
				groupSortOrder: 1,
				title: 'second',
			})
			// Earlier item was unclaimed - no claim row needed; we just put
			// it into pending-deletion to confirm the gate skips it. Without
			// the fix, the gate would reject the later claim with
			// group-out-of-order because earlier still has remaining qty.
			await tx.update(items).set({ pendingDeletionAt: PENDING }).where(eq(items.id, earlier.id))

			const result = await claimItemGiftImpl({
				gifterId: newGifter.id,
				input: { itemId: later.id, quantity: 1, totalCost: undefined },
				dbx: tx,
			})
			expect(result.kind).toBe('ok')
		})
	})
})
