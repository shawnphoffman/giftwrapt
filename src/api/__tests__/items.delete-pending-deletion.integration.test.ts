// Coverage for the pending-deletion lifecycle entry point: when a
// recipient calls `deleteItem` on an item with active claims, the item
// flips to pending-deletion (not hard-deleted) and an alert email fires
// to the audience (primary gifter + partner; co-gifters silent).

import { makeDependent, makeDependentGuardianship, makeGiftedItem, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'

import { deleteItemImpl } from '@/api/_items-impl'
import { giftedItems, items } from '@/db/schema'

vi.mock('@/lib/resend', () => ({
	sendOrphanClaimEmail: vi.fn(() => Promise.resolve(null)),
	sendOrphanClaimCleanupReminderEmail: vi.fn(() => Promise.resolve(null)),
	isEmailConfigured: vi.fn(() => Promise.resolve(true)),
}))

const { sendOrphanClaimEmail, isEmailConfigured } = await import('@/lib/resend')

describe('deleteItemImpl pending-deletion flip', () => {
	it('flips pendingDeletionAt and keeps claims when the item has active claims', async () => {
		vi.mocked(sendOrphanClaimEmail).mockClear()
		await withRollback(async tx => {
			const owner = await makeUser(tx, { name: 'Recipient' })
			const gifter = await makeUser(tx, { name: 'Gifter' })
			const list = await makeList(tx, { ownerId: owner.id, name: 'Wishlist' })
			const item = await makeItem(tx, { listId: list.id, title: 'Espresso machine' })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const result = await deleteItemImpl({
				db: tx,
				actor: { id: owner.id },
				input: { itemId: item.id },
			})

			expect(result).toEqual({ kind: 'ok' })
			const after = await tx.select().from(items).where(eq(items.id, item.id))
			expect(after).toHaveLength(1)
			expect(after[0].pendingDeletionAt).toBeInstanceOf(Date)
			// Claim must survive so the gifter can act on the alert.
			const claims = await tx.select().from(giftedItems).where(eq(giftedItems.itemId, item.id))
			expect(claims).toHaveLength(1)
		})
	})

	it('hard-deletes when there are no claims', async () => {
		vi.mocked(sendOrphanClaimEmail).mockClear()
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })

			const result = await deleteItemImpl({
				db: tx,
				actor: { id: owner.id },
				input: { itemId: item.id },
			})

			expect(result).toEqual({ kind: 'ok' })
			expect(await tx.select().from(items).where(eq(items.id, item.id))).toHaveLength(0)
			expect(sendOrphanClaimEmail).not.toHaveBeenCalled()
		})
	})

	it('emails the primary gifter and their partner; co-gifters silent', async () => {
		vi.mocked(sendOrphanClaimEmail).mockClear()
		await withRollback(async tx => {
			const owner = await makeUser(tx, { name: 'Madison' })
			const partner = await makeUser(tx, { name: 'Partner', email: 'partner@test.local' })
			const gifter = await makeUser(tx, { name: 'Shawn', email: 'shawn@test.local', partnerId: partner.id })
			const coGifter = await makeUser(tx, { name: 'Co Gifter', email: 'cogifter@test.local' })
			const list = await makeList(tx, { ownerId: owner.id, name: "Madison's birthday" })
			const item = await makeItem(tx, { listId: list.id, title: 'Cast iron pot' })
			await makeGiftedItem(tx, {
				itemId: item.id,
				gifterId: gifter.id,
				additionalGifterIds: [coGifter.id],
			})

			await deleteItemImpl({ db: tx, actor: { id: owner.id }, input: { itemId: item.id } })

			expect(isEmailConfigured).toHaveBeenCalled()
			const recipients = vi.mocked(sendOrphanClaimEmail).mock.calls.map(([to]) => to)
			expect(recipients.sort()).toEqual([gifter.email, partner.email].sort())
			// Co-gifter must NOT be in the audience.
			expect(recipients).not.toContain(coGifter.email)
		})
	})

	it('sends one email per audience member regardless of how many claims they own', async () => {
		vi.mocked(sendOrphanClaimEmail).mockClear()
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx, { name: 'Solo Gifter', email: 'solo@test.local' })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, quantity: 5 })
			// Two separate claims by the same gifter (e.g. partial qty).
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id, quantity: 2 })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id, quantity: 1 })

			await deleteItemImpl({ db: tx, actor: { id: owner.id }, input: { itemId: item.id } })

			expect(sendOrphanClaimEmail).toHaveBeenCalledTimes(1)
		})
	})

	it('uses the dependent name as the recipient for dependent-subject lists', async () => {
		vi.mocked(sendOrphanClaimEmail).mockClear()
		await withRollback(async tx => {
			const guardian = await makeUser(tx, { name: 'Guardian' })
			const dep = await makeDependent(tx, { createdByUserId: guardian.id, name: 'Buddy' })
			await makeDependentGuardianship(tx, { guardianUserId: guardian.id, dependentId: dep.id })
			const gifter = await makeUser(tx, { name: 'Gifter', email: 'g@test.local' })
			const list = await makeList(tx, { ownerId: guardian.id, subjectDependentId: dep.id })
			const item = await makeItem(tx, { listId: list.id, title: 'Squeaky toy' })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			await deleteItemImpl({ db: tx, actor: { id: guardian.id }, input: { itemId: item.id } })

			expect(sendOrphanClaimEmail).toHaveBeenCalledTimes(1)
			const [, args] = vi.mocked(sendOrphanClaimEmail).mock.calls[0]
			expect(args.recipientName).toBe('Buddy')
		})
	})

	it('skips email send when email is not configured but still flips state', async () => {
		vi.mocked(sendOrphanClaimEmail).mockClear()
		vi.mocked(isEmailConfigured).mockResolvedValueOnce(false)
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			await deleteItemImpl({ db: tx, actor: { id: owner.id }, input: { itemId: item.id } })

			expect(sendOrphanClaimEmail).not.toHaveBeenCalled()
			const after = await tx.select().from(items).where(eq(items.id, item.id))
			expect(after[0].pendingDeletionAt).toBeInstanceOf(Date)
		})
	})

	it('rejects a second deleteItem on a pending-deletion row (already deleted from recipient view)', async () => {
		vi.mocked(sendOrphanClaimEmail).mockClear()
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			await deleteItemImpl({ db: tx, actor: { id: owner.id }, input: { itemId: item.id } })

			const second = await deleteItemImpl({ db: tx, actor: { id: owner.id }, input: { itemId: item.id } })
			expect(second).toEqual({ kind: 'error', reason: 'not-found' })
		})
	})
})
