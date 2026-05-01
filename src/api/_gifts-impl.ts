// Server-only gift / claim implementations. Lives in a separate file
// from `gifts.ts` so the static import chain into
// `@/routes/api/sse/list.$listId` -> `@/lib/auth` (top-level
// `env.TRUSTED_ORIGINS` access) never leaks into the client bundle.
// `gifts.ts` only references these from inside server-fn handler
// bodies, which TanStack Start strips on the client.

import { and, eq, ne, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { giftedItems, itemGroups, items, lists } from '@/db/schema'
import type { GiftedItem } from '@/db/schema/gifts'
import { computeRemainingClaimableQuantity } from '@/lib/gifts'
import { canViewList } from '@/lib/permissions'
import { notifyListChange } from '@/routes/api/sse/list.$listId'

// ===============================
// CLAIM
// ===============================

export const ClaimGiftInputSchema = z.object({
	itemId: z.number().int().positive(),
	quantity: z.number().int().positive().max(999),
	notes: z.string().max(2000).optional(),
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

export async function claimItemGiftImpl(args: { gifterId: string; input: z.infer<typeof ClaimGiftInputSchema> }): Promise<ClaimGiftResult> {
	const { gifterId, input: data } = args
	const notifyCtx = { listId: null as number | null }

	const result: ClaimGiftResult = await db.transaction(async (tx): Promise<ClaimGiftResult> => {
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

		const list = await tx.query.lists.findFirst({
			where: eq(lists.id, lockedItem.list_id),
			columns: { id: true, ownerId: true, isPrivate: true, isActive: true },
		})
		if (!list) return { kind: 'error', reason: 'item-not-found' }
		if (list.ownerId === gifterId) return { kind: 'error', reason: 'cannot-claim-own-list' }

		const view = await canViewList(gifterId, list)
		if (!view.ok) return { kind: 'error', reason: 'not-visible' }

		if (lockedItem.group_id !== null) {
			const group = await tx.query.itemGroups.findFirst({
				where: eq(itemGroups.id, lockedItem.group_id),
				columns: { id: true, type: true },
			})

			if (group) {
				if (group.type === 'or') {
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

		const existing = await tx.select({ quantity: giftedItems.quantity }).from(giftedItems).where(eq(giftedItems.itemId, data.itemId))

		const remaining = computeRemainingClaimableQuantity(lockedItem.quantity, existing)
		if (data.quantity > remaining) {
			return { kind: 'error', reason: 'over-claim', remaining }
		}

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
}

// ===============================
// UPDATE CLAIM
// ===============================

export const UpdateGiftInputSchema = z.object({
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

export async function updateItemGiftImpl(args: {
	gifterId: string
	input: z.infer<typeof UpdateGiftInputSchema>
}): Promise<UpdateGiftResult> {
	const { gifterId, input: data } = args
	const notifyCtx = { listId: null as number | null }

	const result: UpdateGiftResult = await db.transaction(async (tx): Promise<UpdateGiftResult> => {
		const gift = await tx.query.giftedItems.findFirst({
			where: eq(giftedItems.id, data.giftId),
			columns: { id: true, itemId: true, gifterId: true },
		})
		if (!gift) return { kind: 'error', reason: 'not-found' }
		if (gift.gifterId !== gifterId) return { kind: 'error', reason: 'not-yours' }

		const lockedRows = await tx.execute(sql`SELECT id, list_id, quantity, is_archived FROM items WHERE id = ${gift.itemId} FOR UPDATE`)
		const lockedItem = lockedRows.rows[0] as { id: number; list_id: number; quantity: number; is_archived: boolean } | undefined
		if (!lockedItem || lockedItem.is_archived) return { kind: 'error', reason: 'not-found' }

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
}

// ===============================
// UNCLAIM
// ===============================

export const UnclaimGiftInputSchema = z.object({
	giftId: z.number().int().positive(),
})

export type UnclaimGiftResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-yours' }

export async function unclaimItemGiftImpl(args: {
	gifterId: string
	input: z.infer<typeof UnclaimGiftInputSchema>
}): Promise<UnclaimGiftResult> {
	const { gifterId, input: data } = args

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
}

// ===============================
// CO-GIFTERS
// ===============================

export const UpdateCoGiftersInputSchema = z.object({
	giftId: z.number().int().positive(),
	additionalGifterIds: z.array(z.string()).max(10),
})

export type UpdateCoGiftersResult =
	| { kind: 'ok'; additionalGifterIds: Array<string> | null }
	| { kind: 'error'; reason: 'not-found' | 'not-yours' }

export async function updateCoGiftersImpl(args: {
	gifterId: string
	input: z.infer<typeof UpdateCoGiftersInputSchema>
}): Promise<UpdateCoGiftersResult> {
	const { gifterId, input: data } = args

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
}
