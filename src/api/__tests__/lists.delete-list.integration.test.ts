import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { deleteListImpl } from '@/api/_lists-impl'
import { giftedItems, items, lists } from '@/db/schema'

import { makeGiftedItem, makeItem, makeList, makeListEditor, makeUser } from '../../../test/integration/factories'
import { withRollback } from '../../../test/integration/setup'

describe('deleteListImpl', () => {
	it('hard-deletes a list with no claims and cascades its items', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const a = await makeItem(tx, { listId: list.id })
			const b = await makeItem(tx, { listId: list.id })

			const result = await deleteListImpl({
				db: tx,
				actor: { id: owner.id },
				input: { listId: list.id },
			})

			expect(result).toEqual({ kind: 'ok', action: 'deleted' })
			expect(await tx.select().from(lists).where(eq(lists.id, list.id))).toHaveLength(0)
			expect(await tx.select().from(items).where(eq(items.id, a.id))).toHaveLength(0)
			expect(await tx.select().from(items).where(eq(items.id, b.id))).toHaveLength(0)
		})
	})

	it('archives instead of deleting when any item has a claim', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const claimed = await makeItem(tx, { listId: list.id })
			const unclaimed = await makeItem(tx, { listId: list.id })
			const claim = await makeGiftedItem(tx, { itemId: claimed.id, gifterId: gifter.id })

			const result = await deleteListImpl({
				db: tx,
				actor: { id: owner.id },
				input: { listId: list.id },
			})

			expect(result).toEqual({ kind: 'ok', action: 'archived' })
			const after = await tx.select().from(lists).where(eq(lists.id, list.id))
			expect(after).toHaveLength(1)
			expect(after[0].isActive).toBe(false)
			// Items and the claim row survive so purchase history stays intact.
			expect(await tx.select().from(items).where(eq(items.id, claimed.id))).toHaveLength(1)
			expect(await tx.select().from(items).where(eq(items.id, unclaimed.id))).toHaveLength(1)
			expect(await tx.select().from(giftedItems).where(eq(giftedItems.id, claim.id))).toHaveLength(1)
		})
	})

	it('rejects a non-owner caller (even one with editor rights)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const editor = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			await makeListEditor(tx, { listId: list.id, userId: editor.id, ownerId: owner.id })

			const result = await deleteListImpl({
				db: tx,
				actor: { id: editor.id },
				input: { listId: list.id },
			})

			expect(result).toEqual({ kind: 'error', reason: 'not-owner' })
			expect(await tx.select().from(lists).where(eq(lists.id, list.id))).toHaveLength(1)
		})
	})

	it('returns not-found for an unknown list id', async () => {
		await withRollback(async tx => {
			const actor = await makeUser(tx)
			const result = await deleteListImpl({
				db: tx,
				actor: { id: actor.id },
				input: { listId: 999_999 },
			})
			expect(result).toEqual({ kind: 'error', reason: 'not-found' })
		})
	})

	it('archive on an already-archived list is idempotent', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, isActive: false })
			const item = await makeItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const result = await deleteListImpl({
				db: tx,
				actor: { id: owner.id },
				input: { listId: list.id },
			})
			expect(result).toEqual({ kind: 'ok', action: 'archived' })
			const after = await tx.select().from(lists).where(eq(lists.id, list.id))
			expect(after[0].isActive).toBe(false)
		})
	})
})
