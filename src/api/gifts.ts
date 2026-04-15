import { createServerFn } from '@tanstack/react-start'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { giftedItems, lists } from '@/db/schema'
import type { GiftedItem } from '@/db/schema/gifts'
import { computeRemainingClaimableQuantity } from '@/lib/gifts'
import { canViewList } from '@/lib/permissions'
import { authMiddleware } from '@/middleware/auth'

// ===============================
// READ — gifts for a batch of items
// ===============================
// Batch-by-itemIds rather than one-item-at-a-time so the list-detail view
// can fetch every item's claims in a single round-trip.
//
// NOTE: this returns ALL non-archived claims on the items, regardless of who
// the viewer is. The visibility barrier is "can the viewer see the parent
// list" — enforced by getListForViewing at the list level, not re-enforced
// here per-item. Callers that don't already have list-level visibility MUST
// check it before surfacing the result.

export type GiftWithGifter = GiftedItem & {
	gifter: {
		id: string
		name: string | null
		email: string
		image: string | null
	}
}

export const getGiftsForItems = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.inputValidator((data: { itemIds: Array<number> }) => ({ itemIds: data.itemIds }))
	.handler(async ({ data }): Promise<Array<GiftWithGifter>> => {
		if (data.itemIds.length === 0) return []

		const rows = await db.query.giftedItems.findMany({
			where: (g, { inArray, and: andFn, eq: eqFn }) => andFn(inArray(g.itemId, data.itemIds), eqFn(g.isArchived, false)),
			with: {
				gifter: {
					columns: { id: true, name: true, email: true, image: true },
				},
			},
		})

		return rows
	})

// ===============================
// WRITE — claim quantity on an item
// ===============================
// Invariant: SUM(quantity) over non-archived claims ≤ items.quantity.
// Enforced via a SELECT FOR UPDATE transaction, NOT a DB trigger (decided in
// the Phase 1 design Q&A — keeps the invariant portable and visible in code).
//
// The lock on the item row serializes all concurrent claim attempts for the
// same item. Two tabs trying to claim the last unit race; one wins, the
// other gets over-claim back with the current remaining.

const ClaimGiftInputSchema = z.object({
	itemId: z.number().int().positive(),
	quantity: z.number().int().positive().max(999),
	notes: z.string().max(2000).optional(),
	// Stored as numeric; accept a decimal string or a number, normalize to string.
	totalCost: z
		.union([z.string().regex(/^\d+(\.\d{1,2})?$/), z.number().nonnegative()])
		.optional()
		.transform(v => (v === undefined ? undefined : typeof v === 'number' ? v.toFixed(2) : v)),
})

export type ClaimGiftResult =
	| { kind: 'ok'; gift: GiftedItem }
	| { kind: 'error'; reason: 'item-not-found' | 'not-visible' | 'cannot-claim-own-list' }
	| { kind: 'error'; reason: 'over-claim'; remaining: number }

export const claimItemGift = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.input<typeof ClaimGiftInputSchema>) => ClaimGiftInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<ClaimGiftResult> => {
		const gifterId = context.session.user.id

		return await db.transaction(async tx => {
			// Lock the item row. Any concurrent claim tx on this item waits here.
			// Doing this FIRST (before any reads) is deliberate — the point of the
			// lock is to serialize the "compute remaining → insert" window.
			const lockedRows = await tx.execute(sql`SELECT id, list_id, quantity, is_archived FROM items WHERE id = ${data.itemId} FOR UPDATE`)
			const lockedItem = lockedRows.rows[0] as { id: number; list_id: number; quantity: number; is_archived: boolean } | undefined

			if (!lockedItem || lockedItem.is_archived) {
				return { kind: 'error', reason: 'item-not-found' }
			}

			// Visibility gate: claim requires viewer-level access to the parent list.
			// Owner can't claim against themselves (no self-gifting).
			const list = await tx.query.lists.findFirst({
				where: eq(lists.id, lockedItem.list_id),
				columns: { id: true, ownerId: true, isPrivate: true, isActive: true },
			})
			if (!list) return { kind: 'error', reason: 'item-not-found' }
			if (list.ownerId === gifterId) return { kind: 'error', reason: 'cannot-claim-own-list' }

			const view = await canViewList(gifterId, list)
			if (!view.ok) return { kind: 'error', reason: 'not-visible' }

			// Compute remaining under the lock.
			const existing = await tx
				.select({ quantity: giftedItems.quantity, isArchived: giftedItems.isArchived })
				.from(giftedItems)
				.where(and(eq(giftedItems.itemId, data.itemId), eq(giftedItems.isArchived, false)))

			const remaining = computeRemainingClaimableQuantity(lockedItem.quantity, existing)
			if (data.quantity > remaining) {
				return { kind: 'error', reason: 'over-claim', remaining }
			}

			// Drizzle types `.returning()` as Array<T> with a guaranteed first row for
			// single-value inserts, so no explicit undefined guard is needed. If the
			// runtime ever disagrees, destructuring will surface it as a crash.
			const [inserted] = await tx
				.insert(giftedItems)
				.values({
					itemId: data.itemId,
					gifterId,
					quantity: data.quantity,
					notes: data.notes ?? null,
					totalCost: data.totalCost ?? null,
				})
				.returning()

			return { kind: 'ok', gift: inserted }
		})
	})
