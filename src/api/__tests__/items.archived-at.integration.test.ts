// items.archivedAt is the reveal timestamp (the received-gifts "revealed on"
// date). Every manual reveal path has to stamp it and unarchive has to clear
// it; the cron passes are covered in auto-archive.integration.test.ts.

import { makeGiftedItem, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { archiveItemImpl, archiveListPurchasesImpl } from '@/api/_items-extra-impl'
import { items } from '@/db/schema'

describe('items.archivedAt', () => {
	it('archiveItem stamps the reveal and unarchive clears it', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday' })
			const item = await makeItem(tx, { listId: list.id })

			const before = Date.now()
			expect((await archiveItemImpl({ userId: owner.id, input: { itemId: item.id, archived: true }, dbx: tx })).kind).toBe('ok')
			const archived = await tx.query.items.findFirst({ where: eq(items.id, item.id), columns: { archivedAt: true } })
			expect(archived?.archivedAt?.getTime()).toBeGreaterThanOrEqual(before)

			expect((await archiveItemImpl({ userId: owner.id, input: { itemId: item.id, archived: false }, dbx: tx })).kind).toBe('ok')
			const unarchived = await tx.query.items.findFirst({ where: eq(items.id, item.id), columns: { archivedAt: true } })
			expect(unarchived?.archivedAt).toBeNull()
		})
	})

	it('archiveListPurchases stamps every revealed item with the given clock', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'giftideas' })
			const item = await makeItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })
			const now = new Date('2026-03-08T12:00:00Z')

			expect((await archiveListPurchasesImpl({ userId: owner.id, input: { listId: list.id }, dbx: tx, now })).kind).toBe('ok')
			const row = await tx.query.items.findFirst({ where: eq(items.id, item.id), columns: { isArchived: true, archivedAt: true } })
			expect(row?.isArchived).toBe(true)
			expect(row?.archivedAt?.toISOString()).toBe(now.toISOString())
		})
	})
})
