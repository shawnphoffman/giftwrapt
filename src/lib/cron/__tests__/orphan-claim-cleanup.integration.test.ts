// Coverage for the orphan-claim cleanup cron passes that run inside
// `runBirthdayEmails`:
//   - Pass 1 (reminder): day-before reminder email per audience member,
//     idempotent via giftedItems.orphanReminderSentAt.
//   - Pass 2 (cleanup): event-day hard-delete of every claim on the
//     pending-deletion item plus the item row itself.
// Wishlists (no event date) defer cleanup to 14 days after
// pendingDeletionAt, with the reminder firing 13 days after.

import { makeGiftedItem, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'

import { giftedItems, items } from '@/db/schema'

import { orphanClaimCleanupImpl } from '../orphan-claim-cleanup'

vi.mock('@/lib/resend', () => ({
	sendOrphanClaimEmail: vi.fn(() => Promise.resolve(null)),
	sendOrphanClaimCleanupReminderEmail: vi.fn(() => Promise.resolve(null)),
	isEmailConfigured: vi.fn(() => Promise.resolve(true)),
}))

const { sendOrphanClaimCleanupReminderEmail, isEmailConfigured } = await import('@/lib/resend')

const PENDING_RECENT = new Date('2026-05-01T00:00:00Z')

describe('orphanClaimCleanupImpl - reminder pass', () => {
	it('sends a reminder for a christmas list one day before Christmas', async () => {
		vi.mocked(sendOrphanClaimCleanupReminderEmail).mockClear()
		await withRollback(async tx => {
			const owner = await makeUser(tx, { name: 'Madison' })
			const gifter = await makeUser(tx, { name: 'Shawn', email: 's@test.local' })
			const list = await makeList(tx, { ownerId: owner.id, type: 'christmas', name: "Madison's Christmas" })
			const item = await makeItem(tx, { listId: list.id, title: 'Espresso', pendingDeletionAt: PENDING_RECENT })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const result = await orphanClaimCleanupImpl({ db: tx, now: new Date('2026-12-24T12:00:00Z') })
			expect(result.remindersSent).toBe(1)
			expect(sendOrphanClaimCleanupReminderEmail).toHaveBeenCalledTimes(1)
			expect(result.itemsDeleted).toBe(0)
		})
	})

	it("sends a reminder for a birthday list one day before the recipient's birthday", async () => {
		vi.mocked(sendOrphanClaimCleanupReminderEmail).mockClear()
		await withRollback(async tx => {
			const owner = await makeUser(tx, { name: 'Alex', birthMonth: 'march', birthDay: 15 })
			const gifter = await makeUser(tx, { email: 'g@test.local' })
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday' })
			const item = await makeItem(tx, { listId: list.id, pendingDeletionAt: PENDING_RECENT })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const result = await orphanClaimCleanupImpl({ db: tx, now: new Date('2026-03-14T12:00:00Z') })
			expect(result.remindersSent).toBe(1)
		})
	})

	it('sends a reminder for a wishlist 13 days after pendingDeletionAt', async () => {
		vi.mocked(sendOrphanClaimCleanupReminderEmail).mockClear()
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx, { email: 'g@test.local' })
			const list = await makeList(tx, { ownerId: owner.id, type: 'wishlist' })
			const deletedAt = new Date('2026-05-01T00:00:00Z')
			const item = await makeItem(tx, { listId: list.id, pendingDeletionAt: deletedAt })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			// 13 days after 2026-05-01 is 2026-05-14. Cleanup is on
			// 2026-05-15; reminder fires the day before.
			const result = await orphanClaimCleanupImpl({ db: tx, now: new Date('2026-05-14T12:00:00Z') })
			expect(result.remindersSent).toBe(1)
			expect(result.itemsDeleted).toBe(0)
		})
	})

	it('is idempotent: orphanReminderSentAt blocks a second reminder', async () => {
		vi.mocked(sendOrphanClaimCleanupReminderEmail).mockClear()
		await withRollback(async tx => {
			const owner = await makeUser(tx, { birthMonth: 'march', birthDay: 15 })
			const gifter = await makeUser(tx, { email: 'g@test.local' })
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday' })
			const item = await makeItem(tx, { listId: list.id, pendingDeletionAt: PENDING_RECENT })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id, orphanReminderSentAt: new Date() })

			const result = await orphanClaimCleanupImpl({ db: tx, now: new Date('2026-03-14T12:00:00Z') })
			expect(result.remindersSent).toBe(0)
			expect(sendOrphanClaimCleanupReminderEmail).not.toHaveBeenCalled()
		})
	})

	it('sets orphanReminderSentAt after a successful send', async () => {
		vi.mocked(sendOrphanClaimCleanupReminderEmail).mockClear()
		await withRollback(async tx => {
			const owner = await makeUser(tx, { birthMonth: 'march', birthDay: 15 })
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday' })
			const item = await makeItem(tx, { listId: list.id, pendingDeletionAt: PENDING_RECENT })
			const claim = await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			await orphanClaimCleanupImpl({ db: tx, now: new Date('2026-03-14T12:00:00Z') })

			const after = await tx.select().from(giftedItems).where(eq(giftedItems.id, claim.id))
			expect(after[0].orphanReminderSentAt).toBeInstanceOf(Date)
		})
	})

	it('skips the reminder pass entirely when email is not configured', async () => {
		vi.mocked(sendOrphanClaimCleanupReminderEmail).mockClear()
		vi.mocked(isEmailConfigured).mockResolvedValueOnce(false)
		await withRollback(async tx => {
			const owner = await makeUser(tx, { birthMonth: 'march', birthDay: 15 })
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday' })
			const item = await makeItem(tx, { listId: list.id, pendingDeletionAt: PENDING_RECENT })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const result = await orphanClaimCleanupImpl({ db: tx, now: new Date('2026-03-14T12:00:00Z') })
			expect(result.remindersSent).toBe(0)
			expect(sendOrphanClaimCleanupReminderEmail).not.toHaveBeenCalled()
		})
	})
})

describe('orphanClaimCleanupImpl - cleanup pass', () => {
	it('hard-deletes the item and all its claims on event day (christmas)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const a = await makeUser(tx)
			const b = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'christmas' })
			const item = await makeItem(tx, { listId: list.id, pendingDeletionAt: PENDING_RECENT })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: a.id })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: b.id })

			const result = await orphanClaimCleanupImpl({ db: tx, now: new Date('2026-12-25T01:00:00Z') })
			expect(result.itemsDeleted).toBe(1)
			expect(result.claimsDeleted).toBe(2)
			expect(await tx.select().from(items).where(eq(items.id, item.id))).toHaveLength(0)
			expect(await tx.select().from(giftedItems).where(eq(giftedItems.itemId, item.id))).toHaveLength(0)
		})
	})

	it('runs cleanup regardless of email config', async () => {
		vi.mocked(isEmailConfigured).mockResolvedValueOnce(false)
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'christmas' })
			const item = await makeItem(tx, { listId: list.id, pendingDeletionAt: PENDING_RECENT })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const result = await orphanClaimCleanupImpl({ db: tx, now: new Date('2026-12-25T01:00:00Z') })
			expect(result.itemsDeleted).toBe(1)
		})
	})

	it('cleans up wishlist orphans 14 days after pendingDeletionAt', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'wishlist' })
			const deletedAt = new Date('2026-05-01T00:00:00Z')
			const item = await makeItem(tx, { listId: list.id, pendingDeletionAt: deletedAt })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			// 14 days after 2026-05-01 is 2026-05-15; cleanup fires that day.
			const result = await orphanClaimCleanupImpl({ db: tx, now: new Date('2026-05-15T12:00:00Z') })
			expect(result.itemsDeleted).toBe(1)
		})
	})

	it('does NOT clean up before the cleanup date', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'christmas' })
			const item = await makeItem(tx, { listId: list.id, pendingDeletionAt: PENDING_RECENT })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const result = await orphanClaimCleanupImpl({ db: tx, now: new Date('2026-12-23T12:00:00Z') })
			expect(result.itemsDeleted).toBe(0)
			expect(await tx.select().from(items).where(eq(items.id, item.id))).toHaveLength(1)
		})
	})

	it('cleanup runs even when the parent list has been archived', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'christmas', isActive: false })
			const item = await makeItem(tx, { listId: list.id, pendingDeletionAt: PENDING_RECENT })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const result = await orphanClaimCleanupImpl({ db: tx, now: new Date('2026-12-25T01:00:00Z') })
			expect(result.itemsDeleted).toBe(1)
		})
	})

	it('leaves items that are not in pending-deletion alone', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'christmas' })
			const live = await makeItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: live.id, gifterId: gifter.id })

			const result = await orphanClaimCleanupImpl({ db: tx, now: new Date('2026-12-25T01:00:00Z') })
			expect(result.itemsDeleted).toBe(0)
			expect(await tx.select().from(items).where(eq(items.id, live.id))).toHaveLength(1)
		})
	})
})
