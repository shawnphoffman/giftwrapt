import { createServerFn } from '@tanstack/react-start'
import { and, eq, ne, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { giftedItems, itemGroups, items, lists } from '@/db/schema'
import type { GiftedItem } from '@/db/schema/gifts'
import { computeRemainingClaimableQuantity } from '@/lib/gifts'
import { loggingMiddleware } from '@/lib/logger'
import { canViewList } from '@/lib/permissions'
import { claimLimiter } from '@/lib/rate-limits'
import { authMiddleware } from '@/middleware/auth'
import { rateLimit } from '@/middleware/rate-limit'
import { notifyListChange } from '@/routes/api/sse/list.$listId'

// (Removed: `getGiftsForItems` was an exported server function with zero
// callers and no per-item visibility enforcement. Its docstring told future
// callers to remember to check list-level visibility first, which made it
// a footgun. If batched-claims-for-item-IDs is needed later, build it with
// the visibility check inside the handler so the API isn't fragile. See
// sec-review L1.)

// ===============================
// WRITE - claim quantity on an item
// ===============================
// Invariant: SUM(quantity) over non-archived claims ≤ items.quantity.
// Enforced via a SELECT FOR UPDATE transaction, NOT a DB trigger (decided in
// the Phase 1 design Q&A - keeps the invariant portable and visible in code).
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
	| {
			kind: 'error'
			reason: 'item-not-found' | 'not-visible' | 'cannot-claim-own-list' | 'group-already-claimed' | 'group-out-of-order' | 'unavailable'
			blockingItemTitle?: string
	  }
	| { kind: 'error'; reason: 'over-claim'; remaining: number }

export const claimItemGift = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, rateLimit(claimLimiter), loggingMiddleware])
	.inputValidator((data: z.input<typeof ClaimGiftInputSchema>) => ClaimGiftInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<ClaimGiftResult> => {
		const gifterId = context.session.user.id
		// Object holder so TS tracks mutation through the tx closure; a plain `let`
		// gets re-narrowed to its initializer type once control leaves the closure.
		const notifyCtx = { listId: null as number | null }

		const result: ClaimGiftResult = await db.transaction(async (tx): Promise<ClaimGiftResult> => {
			// Lock the item row. Any concurrent claim tx on this item waits here.
			// Doing this FIRST (before any reads) is deliberate - the point of the
			// lock is to serialize the "compute remaining → insert" window.
			const lockedRows = await tx.execute(
				sql`SELECT id, list_id, quantity, is_archived, availability, group_id, group_sort_order FROM items WHERE id = ${data.itemId} FOR UPDATE`
			)
			const lockedItem = lockedRows.rows[0] as
				| {
						id: number
						list_id: number
						quantity: number
						is_archived: boolean
						availability: 'available' | 'unavailable'
						group_id: number | null
						group_sort_order: number | null
				  }
				| undefined

			if (!lockedItem || lockedItem.is_archived) {
				return { kind: 'error', reason: 'item-not-found' }
			}

			if (lockedItem.availability === 'unavailable') {
				return { kind: 'error', reason: 'unavailable' }
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

			// Group enforcement.
			//
			// 'or' groups: if any sibling item in the group has any claim, the
			// group is satisfied - block this claim.
			//
			// 'order' groups: only the next-in-sequence not-fully-claimed item
			// is claimable. If an earlier item in groupSortOrder still has
			// remaining quantity, block this claim.
			//
			// In both cases, the OWN item already being partially claimed is
			// fine (multiple gifters can stack on the active item).
			if (lockedItem.group_id !== null) {
				const group = await tx.query.itemGroups.findFirst({
					where: eq(itemGroups.id, lockedItem.group_id),
					columns: { id: true, type: true },
				})

				if (group) {
					if (group.type === 'or') {
						// Any sibling claim blocks. Allow stacking on this item.
						const siblings = await tx
							.select({ itemId: giftedItems.itemId, title: items.title })
							.from(giftedItems)
							.innerJoin(items, eq(items.id, giftedItems.itemId))
							.where(and(eq(items.groupId, group.id), ne(items.id, data.itemId)))
							.limit(1)

						if (siblings.length > 0) {
							return { kind: 'error', reason: 'group-already-claimed', blockingItemTitle: siblings[0].title }
						}
					} else if (lockedItem.group_sort_order !== null) {
						// Find any earlier item in the group with remaining quantity.
						const earlierItems = await tx
							.select({
								itemId: items.id,
								title: items.title,
								quantity: items.quantity,
								sortOrder: items.groupSortOrder,
							})
							.from(items)
							.where(
								and(
									eq(items.groupId, group.id),
									eq(items.isArchived, false),
									ne(items.id, data.itemId),
									sql`${items.groupSortOrder} IS NOT NULL`,
									sql`${items.groupSortOrder} < ${lockedItem.group_sort_order}`
								)
							)

						for (const earlier of earlierItems) {
							const earlierClaimed = await tx
								.select({ quantity: giftedItems.quantity })
								.from(giftedItems)
								.where(eq(giftedItems.itemId, earlier.itemId))
							const earlierRemaining = computeRemainingClaimableQuantity(earlier.quantity, earlierClaimed)
							if (earlierRemaining > 0) {
								return { kind: 'error', reason: 'group-out-of-order', blockingItemTitle: earlier.title }
							}
						}
					}
				}
			}

			// Compute remaining under the lock.
			const existing = await tx.select({ quantity: giftedItems.quantity }).from(giftedItems).where(eq(giftedItems.itemId, data.itemId))

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

			notifyCtx.listId = lockedItem.list_id
			return { kind: 'ok', gift: inserted }
		})

		if (notifyCtx.listId !== null) notifyListChange(notifyCtx.listId)
		return result
	})

// ===============================
// WRITE - update a claim
// ===============================
// Edits the gifter's own claim. The over-claim invariant has to be re-checked
// under a lock, because the edit is equivalent to "free the old quantity, take
// the new quantity" - and another tab may have grabbed slots in between.
//
// Ownership is enforced by gifterId match, not by any new permission helper:
// only the original gifter can touch their claim. No owner/editor override.

const UpdateGiftInputSchema = z.object({
	giftId: z.number().int().positive(),
	quantity: z.number().int().positive().max(999),
	notes: z.string().max(2000).nullable().optional(),
	totalCost: z
		.union([z.string().regex(/^\d+(\.\d{1,2})?$/), z.number().nonnegative()])
		.nullable()
		.optional()
		.transform(v => (v === undefined || v === null ? v : typeof v === 'number' ? v.toFixed(2) : v)),
})

export type UpdateGiftResult =
	| { kind: 'ok'; gift: GiftedItem }
	| { kind: 'error'; reason: 'not-found' | 'not-yours' }
	| { kind: 'error'; reason: 'over-claim'; remaining: number }

export const updateItemGift = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, rateLimit(claimLimiter), loggingMiddleware])
	.inputValidator((data: z.input<typeof UpdateGiftInputSchema>) => UpdateGiftInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<UpdateGiftResult> => {
		const gifterId = context.session.user.id
		const notifyCtx = { listId: null as number | null }

		const result: UpdateGiftResult = await db.transaction(async (tx): Promise<UpdateGiftResult> => {
			// Resolve the claim → item first so we can lock the correct item row.
			// We re-check gifterId after the lock to avoid TOCTOU on ownership.
			const gift = await tx.query.giftedItems.findFirst({
				where: eq(giftedItems.id, data.giftId),
				columns: { id: true, itemId: true, gifterId: true },
			})
			if (!gift) return { kind: 'error', reason: 'not-found' }
			if (gift.gifterId !== gifterId) return { kind: 'error', reason: 'not-yours' }

			// Lock the parent item. This serializes any concurrent claim/update on
			// the same item, so the "compute remaining → update" window is atomic.
			const lockedRows = await tx.execute(sql`SELECT id, list_id, quantity, is_archived FROM items WHERE id = ${gift.itemId} FOR UPDATE`)
			const lockedItem = lockedRows.rows[0] as { id: number; list_id: number; quantity: number; is_archived: boolean } | undefined
			if (!lockedItem || lockedItem.is_archived) return { kind: 'error', reason: 'not-found' }

			// Compute remaining EXCLUDING this claim (its old quantity goes back into
			// the pool, then the new quantity is taken). Drizzle's `ne` on the
			// primary key handles the exclusion cleanly.
			const otherClaims = await tx
				.select({ quantity: giftedItems.quantity })
				.from(giftedItems)
				.where(and(eq(giftedItems.itemId, gift.itemId), ne(giftedItems.id, gift.id)))

			const remaining = computeRemainingClaimableQuantity(lockedItem.quantity, otherClaims)
			if (data.quantity > remaining) {
				return { kind: 'error', reason: 'over-claim', remaining }
			}

			const [updated] = await tx
				.update(giftedItems)
				.set({
					quantity: data.quantity,
					// `undefined` = don't touch; `null` = clear the field. The zod schema
					// above distinguishes these on the wire.
					...(data.notes !== undefined ? { notes: data.notes } : {}),
					...(data.totalCost !== undefined ? { totalCost: data.totalCost } : {}),
				})
				.where(eq(giftedItems.id, gift.id))
				.returning()

			notifyCtx.listId = lockedItem.list_id
			return { kind: 'ok', gift: updated }
		})

		if (notifyCtx.listId !== null) notifyListChange(notifyCtx.listId)
		return result
	})

// ===============================
// WRITE - unclaim (hard delete)
// ===============================
// Retracting a claim is a hard DELETE: there's no audit trail need for claims,
// and the UX is "I misclicked, make it go away." No lock needed - a single
// DELETE scoped by gifterId is atomic, and nothing else cares about the row
// after it's gone.

const UnclaimGiftInputSchema = z.object({
	giftId: z.number().int().positive(),
})

export type UnclaimGiftResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-yours' }

export const unclaimItemGift = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, rateLimit(claimLimiter), loggingMiddleware])
	.inputValidator((data: z.input<typeof UnclaimGiftInputSchema>) => UnclaimGiftInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<UnclaimGiftResult> => {
		const gifterId = context.session.user.id

		// Pre-check so we can distinguish "doesn't exist" from "not yours" in the
		// response. The DELETE itself is still scoped by gifterId as a guardrail -
		// if the row gets reassigned between the read and the delete, the delete
		// no-ops safely. Also resolve listId here for the SSE notify below.
		const existing = await db
			.select({ id: giftedItems.id, gifterId: giftedItems.gifterId, listId: items.listId })
			.from(giftedItems)
			.innerJoin(items, eq(items.id, giftedItems.itemId))
			.where(eq(giftedItems.id, data.giftId))
			.then(rows => rows.at(0))
		if (!existing) return { kind: 'error', reason: 'not-found' }
		if (existing.gifterId !== gifterId) return { kind: 'error', reason: 'not-yours' }

		await db.delete(giftedItems).where(and(eq(giftedItems.id, data.giftId), eq(giftedItems.gifterId, gifterId)))

		notifyListChange(existing.listId)
		return { kind: 'ok' }
	})

// ===============================
// WRITE - update co-gifters
// ===============================
// Only the original gifter can add or remove co-gifters on their claim.
// Co-gifters are stored as an array of user IDs.

const UpdateCoGiftersInputSchema = z.object({
	giftId: z.number().int().positive(),
	additionalGifterIds: z.array(z.string()).max(10),
})

export type UpdateCoGiftersResult =
	| { kind: 'ok'; additionalGifterIds: Array<string> | null }
	| { kind: 'error'; reason: 'not-found' | 'not-yours' }

export const updateCoGifters = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof UpdateCoGiftersInputSchema>) => UpdateCoGiftersInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<UpdateCoGiftersResult> => {
		const gifterId = context.session.user.id

		const gift = await db.query.giftedItems.findFirst({
			where: eq(giftedItems.id, data.giftId),
			columns: { id: true, gifterId: true },
		})
		if (!gift) return { kind: 'error', reason: 'not-found' }
		if (gift.gifterId !== gifterId) return { kind: 'error', reason: 'not-yours' }

		const ids = data.additionalGifterIds.length > 0 ? data.additionalGifterIds : null

		const [updated] = await db
			.update(giftedItems)
			.set({ additionalGifterIds: ids })
			.where(eq(giftedItems.id, data.giftId))
			.returning({ additionalGifterIds: giftedItems.additionalGifterIds })

		return { kind: 'ok', additionalGifterIds: updated.additionalGifterIds }
	})
