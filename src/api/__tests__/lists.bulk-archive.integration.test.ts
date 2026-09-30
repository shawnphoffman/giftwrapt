import { makeGiftedItem, makeItem, makeList, makeListAddon, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq, inArray } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { bulkArchiveClaimedItemsImpl } from '@/api/admin'
import { items, listAddons, lists } from '@/db/schema'

describe('bulkArchiveClaimedItemsImpl', () => {
	it('archives only non-archived items that have at least one claim', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const listA = await makeList(tx, { ownerId: owner.id })
			const listB = await makeList(tx, { ownerId: owner.id })

			// Two non-archived items with claims - should be archived.
			const claimed1 = await makeItem(tx, { listId: listA.id, isArchived: false })
			const claimed2 = await makeItem(tx, { listId: listB.id, isArchived: false })
			await makeGiftedItem(tx, { itemId: claimed1.id, gifterId: gifter.id })
			await makeGiftedItem(tx, { itemId: claimed2.id, gifterId: gifter.id })

			// One claimed-but-already-archived item: skipped (filtered by inner join).
			const claimedArchived = await makeItem(tx, { listId: listA.id, isArchived: true })
			await makeGiftedItem(tx, { itemId: claimedArchived.id, gifterId: gifter.id })

			// Two unclaimed items: untouched.
			const unclaimed1 = await makeItem(tx, { listId: listA.id })
			const unclaimed2 = await makeItem(tx, { listId: listB.id })

			const result = await bulkArchiveClaimedItemsImpl({ db: tx })
			expect(result).toEqual({ kind: 'ok', archivedCount: 2, addonsArchivedCount: 0, listCount: 2 })

			const updated = await tx
				.select({ id: items.id, isArchived: items.isArchived })
				.from(items)
				.where(inArray(items.id, [claimed1.id, claimed2.id, claimedArchived.id, unclaimed1.id, unclaimed2.id]))
			const byId = new Map(updated.map(r => [r.id, r.isArchived]))
			expect(byId.get(claimed1.id)).toBe(true)
			expect(byId.get(claimed2.id)).toBe(true)
			// Already archived: still archived (no change), not counted.
			expect(byId.get(claimedArchived.id)).toBe(true)
			expect(byId.get(unclaimed1.id)).toBe(false)
			expect(byId.get(unclaimed2.id)).toBe(false)
		})
	})

	it('returns archivedCount: 0 when no claims exist', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })

			const result = await bulkArchiveClaimedItemsImpl({ db: tx })
			expect(result).toEqual({ kind: 'ok', archivedCount: 0, addonsArchivedCount: 0, listCount: 0 })

			const after = await tx.select().from(items).where(eq(items.id, item.id))
			expect(after[0].isArchived).toBe(false)
		})
	})

	it('returns archivedCount: 0 when all claimed items are already archived', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, isArchived: true })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const result = await bulkArchiveClaimedItemsImpl({ db: tx })
			expect(result).toEqual({ kind: 'ok', archivedCount: 0, addonsArchivedCount: 0, listCount: 0 })
		})
	})

	it('reveals off-list gifts too and stamps the list like any other reveal', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			// Addon-only list: nothing claimed, but the off-list gift is still hidden.
			const list = await makeList(tx, { ownerId: owner.id })
			const addon = await makeListAddon(tx, { listId: list.id, userId: gifter.id })
			const now = new Date('2026-03-08T12:00:00Z')

			const result = await bulkArchiveClaimedItemsImpl({ db: tx, now })
			expect(result).toEqual({ kind: 'ok', archivedCount: 0, addonsArchivedCount: 1, listCount: 1 })

			const [addonRow] = await tx.select({ isArchived: listAddons.isArchived }).from(listAddons).where(eq(listAddons.id, addon.id))
			expect(addonRow.isArchived).toBe(true)
			const [listRow] = await tx.select({ lastArchivedAt: lists.lastArchivedAt }).from(lists).where(eq(lists.id, list.id))
			expect(listRow.lastArchivedAt?.toISOString()).toBe(now.toISOString())
		})
	})
})
