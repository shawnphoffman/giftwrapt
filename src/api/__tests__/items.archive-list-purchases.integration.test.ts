// Coverage for `archiveListPurchasesImpl` ("Archive all purchases" button
// on the list-settings dialog). The recipient-driven reveal flow has to
// flip both claimed items and gifter-volunteered listAddons, otherwise
// addons never surface on the received-gifts page.

import { makeGiftedItem, makeItem, makeList, makeListAddon, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { archiveListPurchasesImpl } from '@/api/_items-extra-impl'
import { items, listAddons } from '@/db/schema'

describe('archiveListPurchasesImpl', () => {
	it('archives claimed items and list addons on the list', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'wishlist' })
			const claimed = await makeItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: claimed.id, gifterId: gifter.id })
			const addon = await makeListAddon(tx, { listId: list.id, userId: gifter.id })

			const result = await archiveListPurchasesImpl({
				userId: owner.id,
				input: { listId: list.id },
				dbx: tx,
			})

			expect(result.kind).toBe('ok')
			if (result.kind !== 'ok') return
			expect(result.updated).toBe(1)
			expect(result.addonsArchived).toBe(1)

			const [itemRow] = await tx.select().from(items).where(eq(items.id, claimed.id))
			expect(itemRow.isArchived).toBe(true)
			const [addonRow] = await tx.select().from(listAddons).where(eq(listAddons.id, addon.id))
			expect(addonRow.isArchived).toBe(true)
		})
	})

	it('archives addons even when the list has no claimed items', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'wishlist' })
			const addon = await makeListAddon(tx, { listId: list.id, userId: gifter.id })

			const result = await archiveListPurchasesImpl({
				userId: owner.id,
				input: { listId: list.id },
				dbx: tx,
			})

			expect(result.kind).toBe('ok')
			if (result.kind !== 'ok') return
			expect(result.updated).toBe(0)
			expect(result.addonsArchived).toBe(1)
			const [addonRow] = await tx.select().from(listAddons).where(eq(listAddons.id, addon.id))
			expect(addonRow.isArchived).toBe(true)
		})
	})

	it('returns zero counts when the list has nothing to archive', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'wishlist' })

			const result = await archiveListPurchasesImpl({
				userId: owner.id,
				input: { listId: list.id },
				dbx: tx,
			})

			expect(result.kind).toBe('ok')
			if (result.kind !== 'ok') return
			expect(result.updated).toBe(0)
			expect(result.addonsArchived).toBe(0)
		})
	})

	it('does not touch already-archived addons', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'wishlist' })
			await makeListAddon(tx, { listId: list.id, userId: gifter.id, isArchived: true })

			const result = await archiveListPurchasesImpl({
				userId: owner.id,
				input: { listId: list.id },
				dbx: tx,
			})

			expect(result.kind).toBe('ok')
			if (result.kind !== 'ok') return
			expect(result.addonsArchived).toBe(0)
		})
	})
})
