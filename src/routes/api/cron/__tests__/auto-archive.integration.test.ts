// Integration coverage for the auto-archive cron impl.
//
// The bearer-token check sits in `src/lib/cron-auth.ts` and is unit-tested
// by `src/lib/__tests__/cron-auth.test.ts`. The handler-level wiring is
// covered by `src/api/__tests__/auth-boundary.test.ts` (asserts every
// cron route imports `checkCronAuth`). This file focuses on what those
// can't see: that the impl actually archives the right rows, leaves
// others alone, and respects the settings-driven delays.

import { eq, inArray } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { giftedItems, items } from '@/db/schema'

import { makeGiftedItem, makeItem, makeList, makeUser } from '../../../../../test/integration/factories'
import { withRollback } from '../../../../../test/integration/setup'
import { autoArchiveImpl } from '../_auto-archive-impl'

describe('autoArchiveImpl - birthday lists', () => {
	it('archives claimed items on a birthday list when run on the configured delay', async () => {
		await withRollback(async tx => {
			// User born March 1; run "today" as March 8 with a 7-day delay.
			const owner = await makeUser(tx, { birthMonth: 'march', birthDay: 1 })
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday' })
			const claimed = await makeItem(tx, { listId: list.id })
			const unclaimed = await makeItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: claimed.id, gifterId: gifter.id })

			const result = await autoArchiveImpl({
				db: tx,
				now: new Date('2026-03-08T12:00:00Z'),
				archiveDaysAfterBirthday: 7,
				archiveDaysAfterChristmas: 30,
			})

			expect(result.birthdayArchived).toBe(1)
			const after = await tx
				.select({ id: items.id, isArchived: items.isArchived })
				.from(items)
				.where(inArray(items.id, [claimed.id, unclaimed.id]))
			const byId = new Map(after.map(r => [r.id, r.isArchived]))
			expect(byId.get(claimed.id)).toBe(true)
			// Unclaimed items stay un-archived: archiving them would surface a
			// "your gift was given" empty state to the recipient.
			expect(byId.get(unclaimed.id)).toBe(false)
		})
	})

	it('does not archive when the configured delay does not match today', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { birthMonth: 'march', birthDay: 1 })
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday' })
			const claimed = await makeItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: claimed.id, gifterId: gifter.id })

			// Birthday was 7 days ago; archive delay is 30. Should be a no-op.
			const result = await autoArchiveImpl({
				db: tx,
				now: new Date('2026-03-08T12:00:00Z'),
				archiveDaysAfterBirthday: 30,
				archiveDaysAfterChristmas: 30,
			})

			expect(result.birthdayArchived).toBe(0)
			const [row] = await tx.select({ isArchived: items.isArchived }).from(items).where(eq(items.id, claimed.id))
			expect(row.isArchived).toBe(false)
		})
	})

	it('does not touch already-archived items', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { birthMonth: 'april', birthDay: 5 })
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday' })
			const alreadyArchived = await makeItem(tx, { listId: list.id, isArchived: true })
			await makeGiftedItem(tx, { itemId: alreadyArchived.id, gifterId: gifter.id })

			const result = await autoArchiveImpl({
				db: tx,
				now: new Date('2026-04-12T12:00:00Z'),
				archiveDaysAfterBirthday: 7,
				archiveDaysAfterChristmas: 30,
			})

			// The selectDistinct filters items.isArchived = false up front, so
			// archived items don't appear in the count.
			expect(result.birthdayArchived).toBe(0)
		})
	})

	it('also archives wishlist-type lists for users on their delay day (legacy "wishlist as birthday list" support)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { birthMonth: 'may', birthDay: 1 })
			const gifter = await makeUser(tx)
			const wishList = await makeList(tx, { ownerId: owner.id, type: 'wishlist' })
			const item = await makeItem(tx, { listId: wishList.id })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const result = await autoArchiveImpl({
				db: tx,
				now: new Date('2026-05-08T12:00:00Z'),
				archiveDaysAfterBirthday: 7,
				archiveDaysAfterChristmas: 30,
			})

			expect(result.birthdayArchived).toBe(1)
		})
	})

	it('skips inactive lists', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { birthMonth: 'june', birthDay: 1 })
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'birthday', isActive: false })
			const item = await makeItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const result = await autoArchiveImpl({
				db: tx,
				now: new Date('2026-06-08T12:00:00Z'),
				archiveDaysAfterBirthday: 7,
				archiveDaysAfterChristmas: 30,
			})

			expect(result.birthdayArchived).toBe(0)
			const [row] = await tx.select({ isArchived: items.isArchived }).from(items).where(eq(items.id, item.id))
			expect(row.isArchived).toBe(false)
		})
	})

	it('does not affect other users on the same day', async () => {
		await withRollback(async tx => {
			// Both users born March 1, but only `target` should be processed
			// per call. Confirm we get all of them in one pass.
			const a = await makeUser(tx, { birthMonth: 'march', birthDay: 1 })
			const b = await makeUser(tx, { birthMonth: 'march', birthDay: 1 })
			const c = await makeUser(tx, { birthMonth: 'march', birthDay: 2 })
			const gifter = await makeUser(tx)

			const listA = await makeList(tx, { ownerId: a.id, type: 'birthday' })
			const listB = await makeList(tx, { ownerId: b.id, type: 'birthday' })
			const listC = await makeList(tx, { ownerId: c.id, type: 'birthday' })

			const itemA = await makeItem(tx, { listId: listA.id })
			const itemB = await makeItem(tx, { listId: listB.id })
			const itemC = await makeItem(tx, { listId: listC.id })

			await makeGiftedItem(tx, { itemId: itemA.id, gifterId: gifter.id })
			await makeGiftedItem(tx, { itemId: itemB.id, gifterId: gifter.id })
			await makeGiftedItem(tx, { itemId: itemC.id, gifterId: gifter.id })

			const result = await autoArchiveImpl({
				db: tx,
				now: new Date('2026-03-08T12:00:00Z'),
				archiveDaysAfterBirthday: 7,
				archiveDaysAfterChristmas: 30,
			})

			// Two users qualify (a and b); c is one day off.
			expect(result.birthdayArchived).toBe(2)
			const [aRow, bRow, cRow] = await tx
				.select({ id: items.id, isArchived: items.isArchived })
				.from(items)
				.where(inArray(items.id, [itemA.id, itemB.id, itemC.id]))
				.orderBy(items.id)
			expect(aRow.isArchived).toBe(true)
			expect(bRow.isArchived).toBe(true)
			expect(cRow.isArchived).toBe(false)
		})
	})
})

describe('autoArchiveImpl - christmas lists', () => {
	it('archives claimed items on christmas-type lists when daysSinceChristmas matches', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const xmasList = await makeList(tx, { ownerId: owner.id, type: 'christmas' })
			const claimed = await makeItem(tx, { listId: xmasList.id })
			const unclaimed = await makeItem(tx, { listId: xmasList.id })
			await makeGiftedItem(tx, { itemId: claimed.id, gifterId: gifter.id })

			// Jan 24, 2026 = 30 days after Dec 25, 2025.
			const result = await autoArchiveImpl({
				db: tx,
				now: new Date('2026-01-24T12:00:00Z'),
				archiveDaysAfterBirthday: 7,
				archiveDaysAfterChristmas: 30,
			})

			expect(result.christmasArchived).toBe(1)
			const after = await tx
				.select({ id: items.id, isArchived: items.isArchived })
				.from(items)
				.where(inArray(items.id, [claimed.id, unclaimed.id]))
			const byId = new Map(after.map(r => [r.id, r.isArchived]))
			expect(byId.get(claimed.id)).toBe(true)
			expect(byId.get(unclaimed.id)).toBe(false)
		})
	})

	it('does not archive when daysSinceChristmas does not match the configured delay exactly', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'christmas' })
			const claimed = await makeItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: claimed.id, gifterId: gifter.id })

			// 29 days after, but delay is 30.
			const result = await autoArchiveImpl({
				db: tx,
				now: new Date('2026-01-23T12:00:00Z'),
				archiveDaysAfterBirthday: 7,
				archiveDaysAfterChristmas: 30,
			})

			expect(result.christmasArchived).toBe(0)
			const [row] = await tx.select({ isArchived: items.isArchived }).from(items).where(eq(items.id, claimed.id))
			expect(row.isArchived).toBe(false)
		})
	})

	it('only counts each item once regardless of how many claims it has', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const a = await makeUser(tx)
			const b = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, type: 'christmas' })
			const item = await makeItem(tx, { listId: list.id })
			// Two claims (giftedItems rows) on the same item.
			await makeGiftedItem(tx, { itemId: item.id, gifterId: a.id })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: b.id })

			const result = await autoArchiveImpl({
				db: tx,
				now: new Date('2026-01-24T12:00:00Z'),
				archiveDaysAfterBirthday: 7,
				archiveDaysAfterChristmas: 30,
			})

			expect(result.christmasArchived).toBe(1)
			// Sanity: the single item flipped to archived; both claims survive.
			const claimRows = await tx.select().from(giftedItems).where(eq(giftedItems.itemId, item.id))
			expect(claimRows).toHaveLength(2)
		})
	})
})
