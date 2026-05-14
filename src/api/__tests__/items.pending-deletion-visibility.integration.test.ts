// Spoiler-protection coverage for the pending-deletion state. The item
// must be invisible to the recipient (every surface), invisible to other
// gifters (no claim of theirs on it), and invisible to the recipient's
// archived/organize view. The orphan-claim audience reaches it ONLY via
// the orphan-claim server fns (covered separately).

import { makeGiftedItem, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { getCommentsForItemImpl } from '@/api/_comments-impl'
import { archiveItemImpl, getItemsForListEditImpl, getItemsForListViewImpl, setItemAvailabilityImpl } from '@/api/_items-extra-impl'
import { deleteItemImpl, updateItemImpl } from '@/api/_items-impl'

const PENDING = new Date('2026-05-13T00:00:00Z')

describe('pending-deletion visibility on the recipient side', () => {
	it('is hidden from getItemsForListEdit (default - excludes archived)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			await makeItem(tx, { listId: list.id, title: 'visible' })
			await makeItem(tx, { listId: list.id, title: 'pending', pendingDeletionAt: PENDING })

			const result = await getItemsForListEditImpl({ userId: owner.id, listId: String(list.id) })
			expect(result.kind).toBe('ok')
			if (result.kind !== 'ok') return
			expect(result.items.map(i => i.title)).toEqual(['visible'])
		})
	})

	it('is hidden from getItemsForListEdit even with includeArchived=true (organize view)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			await makeItem(tx, { listId: list.id, title: 'archived', isArchived: true })
			await makeItem(tx, { listId: list.id, title: 'pending', pendingDeletionAt: PENDING })

			const result = await getItemsForListEditImpl({
				userId: owner.id,
				listId: String(list.id),
				includeArchived: true,
			})
			expect(result.kind).toBe('ok')
			if (result.kind !== 'ok') return
			expect(result.items.map(i => i.title)).toEqual(['archived'])
		})
	})

	it('updateItem on a pending-deletion item returns not-found (404 to the recipient)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, pendingDeletionAt: PENDING })

			const result = await updateItemImpl({
				db: tx,
				actor: { id: owner.id },
				input: { itemId: item.id, title: 'Renamed' },
			})
			expect(result).toEqual({ kind: 'error', reason: 'not-found' })
		})
	})

	it('archiveItem on a pending-deletion item returns not-found', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, pendingDeletionAt: PENDING })

			const result = await archiveItemImpl({
				userId: owner.id,
				input: { itemId: item.id, archived: true },
				dbx: tx,
			})
			expect(result).toEqual({ kind: 'error', reason: 'not-found' })
		})
	})

	it('setItemAvailability on a pending-deletion item returns not-found', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, pendingDeletionAt: PENDING })

			const result = await setItemAvailabilityImpl({
				userId: owner.id,
				input: { itemId: item.id, availability: 'unavailable' },
			})
			expect(result).toEqual({ kind: 'error', reason: 'not-found' })
		})
	})

	it('deleteItem on a pending-deletion item is idempotent (treated as not-found)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, pendingDeletionAt: PENDING })

			const result = await deleteItemImpl({
				db: tx,
				actor: { id: owner.id },
				input: { itemId: item.id },
			})
			expect(result).toEqual({ kind: 'error', reason: 'not-found' })
		})
	})
})

describe('pending-deletion visibility on the gifter side', () => {
	it('is hidden from getItemsForListView (other gifters cannot see it)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const otherGifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			await makeItem(tx, { listId: list.id, title: 'visible' })
			await makeItem(tx, { listId: list.id, title: 'pending', pendingDeletionAt: PENDING })

			const result = await getItemsForListViewImpl({ userId: otherGifter.id, listId: String(list.id), dbx: tx })
			expect(result.kind).toBe('ok')
			if (result.kind !== 'ok') return
			expect(result.items.map(i => i.title)).toEqual(['visible'])
		})
	})

	it('is hidden from getItemsForListView even for the gifter who has a claim on it (orphan UI surfaces it separately)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const live = await makeItem(tx, { listId: list.id, title: 'visible' })
			const pending = await makeItem(tx, { listId: list.id, title: 'pending', pendingDeletionAt: PENDING })
			await makeGiftedItem(tx, { itemId: live.id, gifterId: gifter.id })
			await makeGiftedItem(tx, { itemId: pending.id, gifterId: gifter.id })

			const result = await getItemsForListViewImpl({ userId: gifter.id, listId: String(list.id), dbx: tx })
			expect(result.kind).toBe('ok')
			if (result.kind !== 'ok') return
			expect(result.items.map(i => i.title)).toEqual(['visible'])
		})
	})
})

describe('pending-deletion comments are hidden', () => {
	it('returns no comments for a pending-deletion item, even to the recipient', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, pendingDeletionAt: PENDING })

			const rows = await getCommentsForItemImpl({ userId: owner.id, itemId: item.id, dbx: tx })
			expect(rows).toEqual([])
		})
	})
})
