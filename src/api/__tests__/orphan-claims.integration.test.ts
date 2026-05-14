// Coverage for the three orphan-claim server fns:
//   - getOrphanedClaimsForListImpl: per-list alert source (audience-scoped)
//   - getOrphanedClaimsSummaryImpl: /purchases summary, grouped by list
//   - acknowledgeOrphanedClaimImpl: claim hard-delete, item hard-delete on
//     last-claim removal, auth gate (gifter or partner only)

import { makeDependent, makeDependentGuardianship, makeGiftedItem, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { acknowledgeOrphanedClaimImpl, getOrphanedClaimsForListImpl, getOrphanedClaimsSummaryImpl } from '@/api/_orphan-claims-impl'
import type { SchemaDatabase } from '@/db'
import { giftedItems, items, users } from '@/db/schema'

async function makePendingItem(tx: SchemaDatabase, args: { listId: number; title?: string; pendingDeletionAt?: Date }) {
	return await makeItem(tx, {
		listId: args.listId,
		title: args.title ?? 'Pending item',
		pendingDeletionAt: args.pendingDeletionAt ?? new Date('2026-05-13T00:00:00Z'),
	})
}

describe('getOrphanedClaimsForListImpl', () => {
	it('returns rows where the viewer is the primary gifter', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makePendingItem(tx, { listId: list.id, title: 'Cast iron pot' })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const rows = await getOrphanedClaimsForListImpl({ userId: gifter.id, listId: list.id, dbx: tx })
			expect(rows).toHaveLength(1)
			expect(rows[0].itemTitle).toBe('Cast iron pot')
			expect(rows[0].isPartnerPurchase).toBe(false)
		})
	})

	it("includes the partner's claims and flags isPartnerPurchase", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const partner = await makeUser(tx)
			const viewer = await makeUser(tx, { partnerId: partner.id })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makePendingItem(tx, { listId: list.id, title: 'Hand mixer' })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: partner.id })

			const rows = await getOrphanedClaimsForListImpl({ userId: viewer.id, listId: list.id, dbx: tx })
			expect(rows).toHaveLength(1)
			expect(rows[0].isPartnerPurchase).toBe(true)
		})
	})

	it('excludes claims by unrelated users', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const viewer = await makeUser(tx)
			const stranger = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makePendingItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: stranger.id })

			const rows = await getOrphanedClaimsForListImpl({ userId: viewer.id, listId: list.id, dbx: tx })
			expect(rows).toHaveLength(0)
		})
	})

	it('returns nothing for items that are not in pending-deletion', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const live = await makeItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: live.id, gifterId: gifter.id })

			const rows = await getOrphanedClaimsForListImpl({ userId: gifter.id, listId: list.id, dbx: tx })
			expect(rows).toHaveLength(0)
		})
	})

	it('orders rows by pendingDeletionAt ascending (oldest first)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const newer = await makePendingItem(tx, {
				listId: list.id,
				title: 'newer',
				pendingDeletionAt: new Date('2026-05-13T00:00:00Z'),
			})
			const older = await makePendingItem(tx, {
				listId: list.id,
				title: 'older',
				pendingDeletionAt: new Date('2026-05-10T00:00:00Z'),
			})
			await makeGiftedItem(tx, { itemId: newer.id, gifterId: gifter.id })
			await makeGiftedItem(tx, { itemId: older.id, gifterId: gifter.id })

			const rows = await getOrphanedClaimsForListImpl({ userId: gifter.id, listId: list.id, dbx: tx })
			expect(rows.map(r => r.itemTitle)).toEqual(['older', 'newer'])
		})
	})
})

describe('getOrphanedClaimsSummaryImpl', () => {
	it('groups orphan claims by list with a count', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { name: 'Alex' })
			const gifter = await makeUser(tx)
			const listA = await makeList(tx, { ownerId: owner.id, name: 'Wishlist' })
			const listB = await makeList(tx, { ownerId: owner.id, name: 'Birthday' })
			const a1 = await makePendingItem(tx, { listId: listA.id })
			const a2 = await makePendingItem(tx, { listId: listA.id })
			const b1 = await makePendingItem(tx, { listId: listB.id })
			await makeGiftedItem(tx, { itemId: a1.id, gifterId: gifter.id })
			await makeGiftedItem(tx, { itemId: a2.id, gifterId: gifter.id })
			await makeGiftedItem(tx, { itemId: b1.id, gifterId: gifter.id })

			const rows = await getOrphanedClaimsSummaryImpl({ userId: gifter.id, dbx: tx })
			expect(rows).toHaveLength(2)
			// Sorted by count desc; listA has 2.
			expect(rows[0]).toMatchObject({ listId: listA.id, count: 2, recipientName: 'Alex', recipientKind: 'user' })
			expect(rows[1]).toMatchObject({ listId: listB.id, count: 1 })
		})
	})

	it('uses the dependent name for dependent-subject lists', async () => {
		await withRollback(async tx => {
			const guardian = await makeUser(tx)
			const dep = await makeDependent(tx, { createdByUserId: guardian.id, name: 'Buddy' })
			await makeDependentGuardianship(tx, { guardianUserId: guardian.id, dependentId: dep.id })
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: guardian.id, subjectDependentId: dep.id })
			const item = await makePendingItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const rows = await getOrphanedClaimsSummaryImpl({ userId: gifter.id, dbx: tx })
			expect(rows).toHaveLength(1)
			expect(rows[0]).toMatchObject({ recipientKind: 'dependent', recipientName: 'Buddy' })
		})
	})

	it('preserves listIsActive flag so the UI can label archived lists', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, isActive: false })
			const item = await makePendingItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const rows = await getOrphanedClaimsSummaryImpl({ userId: gifter.id, dbx: tx })
			expect(rows[0].listIsActive).toBe(false)
		})
	})

	it('returns empty when the viewer has no claims', async () => {
		await withRollback(async tx => {
			const viewer = await makeUser(tx)
			const rows = await getOrphanedClaimsSummaryImpl({ userId: viewer.id, dbx: tx })
			expect(rows).toEqual([])
		})
	})
})

describe('acknowledgeOrphanedClaimImpl', () => {
	it('hard-deletes the claim and the item when it was the last claim', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makePendingItem(tx, { listId: list.id })
			const claim = await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const result = await acknowledgeOrphanedClaimImpl({
				userId: gifter.id,
				input: { giftId: claim.id },
				dbx: tx,
			})

			expect(result).toEqual({ kind: 'ok', itemDeleted: true })
			expect(await tx.select().from(giftedItems).where(eq(giftedItems.id, claim.id))).toHaveLength(0)
			expect(await tx.select().from(items).where(eq(items.id, item.id))).toHaveLength(0)
		})
	})

	it("keeps the item when other claims still exist; deletes only the caller's claim", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifterA = await makeUser(tx)
			const gifterB = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makePendingItem(tx, { listId: list.id, title: 'Shared item' })
			const claimA = await makeGiftedItem(tx, { itemId: item.id, gifterId: gifterA.id })
			const claimB = await makeGiftedItem(tx, { itemId: item.id, gifterId: gifterB.id })

			const result = await acknowledgeOrphanedClaimImpl({
				userId: gifterA.id,
				input: { giftId: claimA.id },
				dbx: tx,
			})

			expect(result).toEqual({ kind: 'ok', itemDeleted: false })
			expect(await tx.select().from(giftedItems).where(eq(giftedItems.id, claimA.id))).toHaveLength(0)
			expect(await tx.select().from(giftedItems).where(eq(giftedItems.id, claimB.id))).toHaveLength(1)
			// Item still exists in pending-deletion until B also acks.
			const after = await tx.select().from(items).where(eq(items.id, item.id))
			expect(after).toHaveLength(1)
			expect(after[0].pendingDeletionAt).toBeInstanceOf(Date)
		})
	})

	it('lets the partner ack on behalf of the primary gifter', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const partner = await makeUser(tx)
			const gifter = await makeUser(tx, { partnerId: partner.id })
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makePendingItem(tx, { listId: list.id })
			const claim = await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			// Mirror the partnership symmetrically (production invariant when
			// partners are linked - see partner-update.ts).
			await tx.update(users).set({ partnerId: gifter.id }).where(eq(users.id, partner.id))

			const result = await acknowledgeOrphanedClaimImpl({
				userId: partner.id,
				input: { giftId: claim.id },
				dbx: tx,
			})

			expect(result).toEqual({ kind: 'ok', itemDeleted: true })
		})
	})

	it('rejects an unrelated user with not-yours', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const stranger = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makePendingItem(tx, { listId: list.id })
			const claim = await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const result = await acknowledgeOrphanedClaimImpl({
				userId: stranger.id,
				input: { giftId: claim.id },
				dbx: tx,
			})
			expect(result).toEqual({ kind: 'error', reason: 'not-yours' })
		})
	})

	it('rejects ack on a claim whose item is NOT in pending-deletion', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			const claim = await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })

			const result = await acknowledgeOrphanedClaimImpl({
				userId: gifter.id,
				input: { giftId: claim.id },
				dbx: tx,
			})
			expect(result).toEqual({ kind: 'error', reason: 'not-pending-deletion' })
		})
	})

	it('returns not-found for an unknown gift id', async () => {
		await withRollback(async tx => {
			const u = await makeUser(tx)
			const result = await acknowledgeOrphanedClaimImpl({
				userId: u.id,
				input: { giftId: 999_999 },
				dbx: tx,
			})
			expect(result).toEqual({ kind: 'error', reason: 'not-found' })
		})
	})
})
