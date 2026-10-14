// Integration coverage for the admin Reveals page: which lists it shows (and
// the spoiler rule that hides an admin's own lists), and the per-list reveal
// that ignores the reveal window.

import { makeDependent, makeGiftedItem, makeItem, makeList, makeListAddon, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { getListsWithHiddenPurchasesImpl, revealListAsAdminImpl } from '@/api/_admin-reveals-impl'
import { items, listAddons, lists } from '@/db/schema'

// Mid-October: last Christmas's cycle revealed long ago, this one is months
// away, so the edit-view force-reveal would refuse.
const OCT_13 = new Date('2026-10-13T12:00:00Z')

describe('getListsWithHiddenPurchasesImpl', () => {
	it('lists hidden claims and off-list gifts, skipping revealed, unclaimed, inactive, and giftideas lists', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const owner = await makeUser(tx, { name: 'Madison' })
			const gifter = await makeUser(tx)

			const xmas = await makeList(tx, { ownerId: owner.id, type: 'christmas', name: 'madimas' })
			const claimed = await makeItem(tx, { listId: xmas.id })
			await makeGiftedItem(tx, { itemId: claimed.id, gifterId: gifter.id })
			const revealed = await makeItem(tx, { listId: xmas.id, isArchived: true })
			await makeGiftedItem(tx, { itemId: revealed.id, gifterId: gifter.id })
			await makeItem(tx, { listId: xmas.id })
			await makeListAddon(tx, { listId: xmas.id, userId: gifter.id })

			const unclaimedOnly = await makeList(tx, { ownerId: owner.id })
			await makeItem(tx, { listId: unclaimedOnly.id })

			const inactive = await makeList(tx, { ownerId: owner.id, isActive: false })
			const inactiveItem = await makeItem(tx, { listId: inactive.id })
			await makeGiftedItem(tx, { itemId: inactiveItem.id, gifterId: gifter.id })

			const ideas = await makeList(tx, { ownerId: gifter.id, type: 'giftideas', isPrivate: true })
			const idea = await makeItem(tx, { listId: ideas.id })
			await makeGiftedItem(tx, { itemId: idea.id, gifterId: admin.id })

			const rows = await getListsWithHiddenPurchasesImpl({ adminId: admin.id, dbx: tx, now: OCT_13 })
			const mine = rows.filter(r => [xmas.id, unclaimedOnly.id, inactive.id, ideas.id].includes(r.listId))
			expect(mine).toHaveLength(1)
			expect(mine[0]).toMatchObject({
				listId: xmas.id,
				listName: 'madimas',
				listType: 'christmas',
				recipientName: 'Madison',
				recipientKind: 'user',
				hiddenItemCount: 1,
				hiddenAddonCount: 1,
				scheduledRevealAt: '2027-01-08T00:00:00.000Z',
			})
		})
	})

	it("never shows the admin their own list, but does show a dependent's list they own", async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const gifter = await makeUser(tx)

			const own = await makeList(tx, { ownerId: admin.id, type: 'christmas' })
			const ownItem = await makeItem(tx, { listId: own.id })
			await makeGiftedItem(tx, { itemId: ownItem.id, gifterId: gifter.id })

			const dep = await makeDependent(tx, { createdByUserId: admin.id, name: 'Fido' })
			const depList = await makeList(tx, { ownerId: admin.id, subjectDependentId: dep.id, type: 'christmas' })
			const depItem = await makeItem(tx, { listId: depList.id })
			await makeGiftedItem(tx, { itemId: depItem.id, gifterId: gifter.id })

			const rows = await getListsWithHiddenPurchasesImpl({ adminId: admin.id, dbx: tx, now: OCT_13 })
			const ids = rows.map(r => r.listId)
			expect(ids).not.toContain(own.id)
			expect(ids).toContain(depList.id)
			expect(rows.find(r => r.listId === depList.id)).toMatchObject({ recipientName: 'Fido', recipientKind: 'dependent' })
		})
	})
})

describe('revealListAsAdminImpl', () => {
	it('reveals hidden claims and off-list gifts outside the reveal window', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'christmas' })
			const claimed = await makeItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: claimed.id, gifterId: gifter.id })
			const unclaimed = await makeItem(tx, { listId: list.id })
			const addon = await makeListAddon(tx, { listId: list.id, userId: gifter.id })

			const res = await revealListAsAdminImpl({ adminId: admin.id, input: { listId: list.id, sendEmail: false }, dbx: tx, now: OCT_13 })
			expect(res).toEqual({ kind: 'ok', updated: 1, addonsArchived: 1, emailSent: false })

			const [c] = await tx.select().from(items).where(eq(items.id, claimed.id))
			expect(c.isArchived).toBe(true)
			expect(c.archivedAt?.toISOString()).toBe(OCT_13.toISOString())
			const [u] = await tx.select().from(items).where(eq(items.id, unclaimed.id))
			expect(u.isArchived).toBe(false)
			const [a] = await tx.select().from(listAddons).where(eq(listAddons.id, addon.id))
			expect(a.isArchived).toBe(true)
			const [l] = await tx.select().from(lists).where(eq(lists.id, list.id))
			expect(l.lastArchivedAt?.toISOString()).toBe(OCT_13.toISOString())

			const rows = await getListsWithHiddenPurchasesImpl({ adminId: admin.id, dbx: tx, now: OCT_13 })
			expect(rows.map(r => r.listId)).not.toContain(list.id)
		})
	})

	it("refuses the admin's own list, inactive lists, and giftideas lists", async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const gifter = await makeUser(tx)

			const own = await makeList(tx, { ownerId: admin.id, type: 'christmas' })
			const ownItem = await makeItem(tx, { listId: own.id })
			await makeGiftedItem(tx, { itemId: ownItem.id, gifterId: gifter.id })
			const inactive = await makeList(tx, { ownerId: gifter.id, isActive: false })
			const ideas = await makeList(tx, { ownerId: gifter.id, type: 'giftideas', isPrivate: true })

			const reveal = (listId: number) =>
				revealListAsAdminImpl({ adminId: admin.id, input: { listId, sendEmail: false }, dbx: tx, now: OCT_13 })
			expect(await reveal(own.id)).toEqual({ kind: 'error', reason: 'own-list' })
			expect(await reveal(inactive.id)).toEqual({ kind: 'error', reason: 'not-found' })
			expect(await reveal(ideas.id)).toEqual({ kind: 'error', reason: 'not-applicable' })
			expect(await reveal(999_999)).toEqual({ kind: 'error', reason: 'not-found' })

			const [i] = await tx.select().from(items).where(eq(items.id, ownItem.id))
			expect(i.isArchived).toBe(false)
		})
	})
})
