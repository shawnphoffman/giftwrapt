// `getListForViewing` normally returns null for an archived list (see
// canViewList's `inactive` reason). For the orphan-claim flow we make a
// targeted exception: a viewer with a pending-deletion claim on the
// list can still navigate to it, so they can ack from the per-list
// alert UI even after the recipient archived the list.

import { makeGiftedItem, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { getItemsForListViewImpl } from '@/api/_items-extra-impl'
import { getListForViewingImpl } from '@/api/_lists-impl'

const PENDING = new Date('2026-05-13T00:00:00Z')

describe('getListForViewingImpl - archived-list orphan exception', () => {
	it('returns the list when the viewer has a pending-deletion claim on it', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, isActive: false })
			const item = await makeItem(tx, { listId: list.id, pendingDeletionAt: PENDING })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const result = await getListForViewingImpl({ userId: gifter.id, listId: String(list.id), dbx: tx })
			expect(result).not.toBeNull()
			expect(result?.kind).toBe('ok')
		})
	})

	it('returns null for an archived list when the viewer has no orphan claim', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const stranger = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, isActive: false })

			const result = await getListForViewingImpl({ userId: stranger.id, listId: String(list.id), dbx: tx })
			expect(result).toBeNull()
		})
	})

	it('the partner of the gifter also gets the archived-list bypass', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const partner = await makeUser(tx)
			const gifter = await makeUser(tx, { partnerId: partner.id })
			const list = await makeList(tx, { ownerId: owner.id, isActive: false })
			const item = await makeItem(tx, { listId: list.id, pendingDeletionAt: PENDING })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const result = await getListForViewingImpl({ userId: partner.id, listId: String(list.id), dbx: tx })
			expect(result).not.toBeNull()
			expect(result?.kind).toBe('ok')
		})
	})

	it('getItemsForListView returns an empty list for an archived-list orphan caller', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, isActive: false })
			const item = await makeItem(tx, { listId: list.id, pendingDeletionAt: PENDING })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			// The page can render its orphan-aside; the items query yields
			// nothing (since the only item is the pending-deletion one and
			// the active-items branch filters it out).
			const result = await getItemsForListViewImpl({ userId: gifter.id, listId: String(list.id), dbx: tx })
			expect(result).toEqual({ kind: 'ok', items: [] })
		})
	})
})
