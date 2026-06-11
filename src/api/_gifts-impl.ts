// Server-only gift / claim implementations. Lives in a separate file
// from `gifts.ts` so the static import chain into
// `@/routes/api/sse/list.$listId` -> `@/lib/auth` (top-level
// `env.TRUSTED_ORIGINS` access) never leaks into the client bundle.
// `gifts.ts` only references these from inside server-fn handler
// bodies, which TanStack Start strips on the client.

import { and, arrayOverlaps, asc, desc, eq, inArray, ne, notInArray, or, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db, type SchemaDatabase } from '@/db'
import { giftContributions, giftedItems, itemGroups, items, lists, users } from '@/db/schema'
import type { GiftedItem } from '@/db/schema/gifts'
import { evenUnitShare, parseTotalCost, unitCount } from '@/lib/contributions'
import { computeRemainingClaimableQuantity } from '@/lib/gifts'
import { visibleItemsWhere } from '@/lib/item-visibility'
import { claimsCreatedTotal, claimsDeletedTotal } from '@/lib/observability/metrics'
import { canViewList } from '@/lib/permissions'
import { LIMITS } from '@/lib/validation/limits'
import { notifyListEvent } from '@/routes/api/sse/list.$listId'

// ===============================
// READ - my outgoing gifts (claims)
// ===============================
// Flat list of every claim the current user is part of, either as the
// primary gifter (giftedItems.gifterId) or as a co-gifter
// (giftedItems.additionalGifterIds contains my id). Joins through
// items + lists to populate the recipient context the caller needs to
// display "you got X for Y" without follow-up round-trips.
//
// Intentionally narrower than `getPurchaseSummary` in `src/api/purchases.ts`:
// no partner purchases, no off-list addons. Use this when you want
// "what have I committed to giving"; use the summary for the spending
// dashboard.

export type MyGiftRow = {
	id: number
	itemId: number
	itemTitle: string
	itemUrl: string | null
	itemImageUrl: string | null
	itemPrice: string | null
	itemCurrency: string | null
	quantity: number
	totalCost: string | null
	notes: string | null
	isPrimaryGifter: boolean
	isCoGifter: boolean
	additionalGifterIds: Array<string> | null
	list: {
		id: number
		name: string
		ownerId: string
		ownerName: string | null
		ownerEmail: string
	}
	createdAt: string
	updatedAt: string
}

// `dbx` accepts either the singleton `db` or a transaction handle so
// integration tests can run inside `withRollback` without deadlocking
// against the open savepoint (pglite is single-connection).
export async function getMyGiftsImpl(dbx: SchemaDatabase, currentUserId: string): Promise<Array<MyGiftRow>> {
	const rows = await dbx
		.select({
			giftId: giftedItems.id,
			gifterId: giftedItems.gifterId,
			additionalGifterIds: giftedItems.additionalGifterIds,
			quantity: giftedItems.quantity,
			totalCost: giftedItems.totalCost,
			notes: giftedItems.notes,
			createdAt: giftedItems.createdAt,
			updatedAt: giftedItems.updatedAt,
			itemId: items.id,
			itemTitle: items.title,
			itemUrl: items.url,
			itemImageUrl: items.imageUrl,
			itemPrice: items.price,
			itemCurrency: items.currency,
			listId: lists.id,
			listName: lists.name,
			listOwnerId: lists.ownerId,
		})
		.from(giftedItems)
		.innerJoin(items, eq(items.id, giftedItems.itemId))
		.innerJoin(lists, eq(lists.id, items.listId))
		.where(or(eq(giftedItems.gifterId, currentUserId), arrayOverlaps(giftedItems.additionalGifterIds, [currentUserId])))
		.orderBy(desc(giftedItems.createdAt))

	const ownerIds = Array.from(new Set(rows.map(r => r.listOwnerId)))
	const owners =
		ownerIds.length > 0
			? await dbx.query.users.findMany({
					where: inArray(users.id, ownerIds),
					columns: { id: true, name: true, email: true },
				})
			: []
	const ownerMap = new Map(owners.map(o => [o.id, o]))

	function toIso(value: Date | string | null | undefined): string {
		if (!value) return new Date().toISOString()
		return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
	}

	return rows.map(r => {
		const owner = ownerMap.get(r.listOwnerId)
		return {
			id: r.giftId,
			itemId: r.itemId,
			itemTitle: r.itemTitle,
			itemUrl: r.itemUrl,
			itemImageUrl: r.itemImageUrl,
			itemPrice: r.itemPrice,
			itemCurrency: r.itemCurrency,
			quantity: r.quantity,
			totalCost: r.totalCost,
			notes: r.notes,
			isPrimaryGifter: r.gifterId === currentUserId,
			isCoGifter: (r.additionalGifterIds ?? []).includes(currentUserId),
			additionalGifterIds: r.additionalGifterIds,
			list: {
				id: r.listId,
				name: r.listName,
				ownerId: r.listOwnerId,
				ownerName: owner?.name ?? null,
				ownerEmail: owner?.email ?? '',
			},
			createdAt: toIso(r.createdAt),
			updatedAt: toIso(r.updatedAt),
		}
	})
}

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

export async function claimItemGiftImpl(args: {
	gifterId: string
	input: z.infer<typeof ClaimGiftInputSchema>
	dbx?: SchemaDatabase
}): Promise<ClaimGiftResult> {
	const { gifterId, input: data, dbx = db } = args
	const notifyCtx = { listId: null as number | null }

	const result: ClaimGiftResult = await dbx.transaction(async (tx): Promise<ClaimGiftResult> => {
		const lockedRows = (await tx.execute(
			sql`SELECT id, list_id, quantity, is_archived, availability, group_id, group_sort_order, pending_deletion_at FROM items WHERE id = ${data.itemId} FOR UPDATE`
		)) as { rows: Array<unknown> }
		const lockedItem = lockedRows.rows[0] as
			| {
					id: number
					list_id: number
					quantity: number
					is_archived: boolean
					availability: 'available' | 'unavailable'
					group_id: number | null
					group_sort_order: number | null
					pending_deletion_at: Date | null
			  }
			| undefined

		// Pending-deletion items cannot accept new claims - they're on
		// their way out (the recipient deleted them) and the orphan-alert
		// flow handles their existing claims.
		if (!lockedItem || lockedItem.is_archived || lockedItem.pending_deletion_at !== null) {
			return { kind: 'error', reason: 'item-not-found' }
		}

		if (lockedItem.availability === 'unavailable') {
			return { kind: 'error', reason: 'unavailable' }
		}

		const list = await tx.query.lists.findFirst({
			where: eq(lists.id, lockedItem.list_id),
			columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
		})
		if (!list) return { kind: 'error', reason: 'item-not-found' }
		// Self-claim is rejected when the list owner is the recipient. For
		// dependent-subject lists the recipient is the dependent, not the
		// guardian who created the list, so guardians (including the owner)
		// can claim - it's a normal gift TO the dependent.
		if (list.ownerId === gifterId && !list.subjectDependentId) {
			return { kind: 'error', reason: 'cannot-claim-own-list' }
		}

		const view = await canViewList(gifterId, list, tx)
		if (!view.ok) return { kind: 'error', reason: 'not-visible' }

		if (lockedItem.group_id !== null) {
			const group = await tx.query.itemGroups.findFirst({
				where: eq(itemGroups.id, lockedItem.group_id),
				columns: { id: true, type: true },
			})

			if (group) {
				if (group.type === 'or') {
					// Pending-deletion siblings don't gate the group: the
					// recipient deleted them, so the gate they represented is
					// no longer wanted.
					const siblings = await tx
						.select({ itemId: giftedItems.itemId, title: items.title })
						.from(giftedItems)
						.innerJoin(items, and(eq(items.id, giftedItems.itemId), visibleItemsWhere('editable')))
						.where(and(eq(items.groupId, group.id), ne(items.id, data.itemId)))
						.limit(1)

					if (siblings.length > 0) {
						return { kind: 'error', reason: 'group-already-claimed', blockingItemTitle: siblings[0].title }
					}
				} else if (lockedItem.group_sort_order !== null) {
					// Same rule for `order` groups: pending-deletion items
					// don't satisfy or block the prerequisite chain.
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
								visibleItemsWhere('visible'),
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

	if (notifyCtx.listId !== null) notifyListEvent({ kind: 'claim', listId: notifyCtx.listId })
	if (result.kind === 'ok') claimsCreatedTotal.inc()
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
	// attachmentUrls is intentionally NOT accepted here - it's managed
	// exclusively by uploadPurchaseAttachment / removePurchaseAttachment so
	// the array shape stays consistent with the stored bucket objects.
	trackingNumber: z.string().max(LIMITS.TRACKING_NUMBER).nullable().optional(),
})

export type UpdateGiftResult =
	| { kind: 'ok'; gift: GiftedItem }
	| { kind: 'error'; reason: 'not-found' | 'not-yours' }
	| { kind: 'error'; reason: 'over-claim'; remaining: number }

// True when `actorId` is the claim's primary gifter or that gifter's partner
// (either partnership direction). Partners share a gifter unit, so a partner may
// edit a claim's metadata (cost / notes / quantity). Unclaim stays primary-only.
async function isPrimaryOrPartner(actorId: string, primaryId: string, dbx: SchemaDatabase): Promise<boolean> {
	if (actorId === primaryId) return true
	const [actor, primary] = await Promise.all([
		dbx.query.users.findFirst({ where: eq(users.id, actorId), columns: { partnerId: true } }),
		dbx.query.users.findFirst({ where: eq(users.id, primaryId), columns: { partnerId: true } }),
	])
	return actor?.partnerId === primaryId || primary?.partnerId === actorId
}

export async function updateItemGiftImpl(args: {
	gifterId: string
	input: z.infer<typeof UpdateGiftInputSchema>
	dbx?: SchemaDatabase
}): Promise<UpdateGiftResult> {
	const { gifterId, input: data, dbx = db } = args
	const notifyCtx = { listId: null as number | null }

	const result: UpdateGiftResult = await dbx.transaction(async (tx): Promise<UpdateGiftResult> => {
		const gift = await tx.query.giftedItems.findFirst({
			where: eq(giftedItems.id, data.giftId),
			columns: { id: true, itemId: true, gifterId: true, totalCost: true },
		})
		if (!gift) return { kind: 'error', reason: 'not-found' }
		// The primary gifter OR their partner may edit the claim's metadata (they
		// share a gifter unit). Unclaim stays primary-only.
		if (!(await isPrimaryOrPartner(gifterId, gift.gifterId, tx))) return { kind: 'error', reason: 'not-yours' }

		const lockedRows = (await tx.execute(sql`SELECT id, list_id, quantity FROM items WHERE id = ${gift.itemId} FOR UPDATE`)) as {
			rows: Array<unknown>
		}
		const lockedItem = lockedRows.rows[0] as { id: number; list_id: number; quantity: number } | undefined
		if (!lockedItem) return { kind: 'error', reason: 'not-found' }

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
				...(data.trackingNumber !== undefined ? { trackingNumber: data.trackingNumber } : {}),
			})
			.where(eq(giftedItems.id, gift.id))
			.returning()

		// Reset-to-even: a totalCost change invalidates any custom split.
		if (data.totalCost !== undefined && data.totalCost !== gift.totalCost) {
			await clearContributionsForGift(gift.id, tx)
		}

		notifyCtx.listId = lockedItem.list_id
		return { kind: 'ok', gift: updated }
	})

	if (notifyCtx.listId !== null) notifyListEvent({ kind: 'claim', listId: notifyCtx.listId })
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
	dbx?: SchemaDatabase
}): Promise<UnclaimGiftResult> {
	const { gifterId, input: data, dbx = db } = args

	const existing = await dbx
		.select({ id: giftedItems.id, gifterId: giftedItems.gifterId, listId: items.listId })
		.from(giftedItems)
		.innerJoin(items, eq(items.id, giftedItems.itemId))
		.where(eq(giftedItems.id, data.giftId))
		.then(rows => rows.at(0))
	if (!existing) return { kind: 'error', reason: 'not-found' }
	if (existing.gifterId !== gifterId) return { kind: 'error', reason: 'not-yours' }

	await dbx.delete(giftedItems).where(and(eq(giftedItems.id, data.giftId), eq(giftedItems.gifterId, gifterId)))

	notifyListEvent({ kind: 'claim', listId: existing.listId })
	claimsDeletedTotal.inc()
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
	| { kind: 'error'; reason: 'not-found' | 'not-yours' | 'not-allowed' }

export type AddableCoGifter = { id: string; name: string | null; email: string }

// The set of user ids that may never be a co-gifter on a claim: the primary
// themselves, the primary's partner (already part of the primary's gifter unit,
// either partnership direction), and the recipient (the list owner; skipped for
// dependent-subject lists, where the recipient is a dependent, not a user). The
// recipient rule is spoiler-critical - a recipient co-gifter would see a claim
// on their own list and skim a phantom slice of the even-split denominator.
async function blockedCoGifterIds(
	primaryId: string,
	itemId: number,
	candidateIds: ReadonlyArray<string>,
	dbx: SchemaDatabase
): Promise<Set<string>> {
	const blocked = new Set<string>([primaryId])

	const item = await dbx.query.items.findFirst({ where: eq(items.id, itemId), columns: { listId: true } })
	const list = item
		? await dbx.query.lists.findFirst({ where: eq(lists.id, item.listId), columns: { ownerId: true, subjectDependentId: true } })
		: null
	if (list && !list.subjectDependentId) blocked.add(list.ownerId)

	const primary = await dbx.query.users.findFirst({ where: eq(users.id, primaryId), columns: { partnerId: true } })
	if (primary?.partnerId) blocked.add(primary.partnerId)

	// Symmetric partner: a candidate who names the primary as their partner.
	if (candidateIds.length > 0) {
		const rows = await dbx
			.select({ id: users.id, partnerId: users.partnerId })
			.from(users)
			.where(inArray(users.id, candidateIds as Array<string>))
		for (const r of rows) if (r.partnerId === primaryId) blocked.add(r.id)
	}
	return blocked
}

// Users the caller may add as co-gifters on their own claim: every non-child
// user except the caller, the caller's partner, the recipient, and anyone
// already on the claim. Returns [] when the caller isn't the primary gifter.
export async function getAddableCoGiftersImpl(args: {
	callerId: string
	giftId: number
	dbx?: SchemaDatabase
}): Promise<Array<AddableCoGifter>> {
	const { callerId, giftId, dbx = db } = args
	const gift = await dbx.query.giftedItems.findFirst({
		where: eq(giftedItems.id, giftId),
		columns: { id: true, gifterId: true, itemId: true, additionalGifterIds: true },
	})
	if (!gift || gift.gifterId !== callerId) return []

	const blocked = await blockedCoGifterIds(callerId, gift.itemId, [], dbx)
	for (const id of gift.additionalGifterIds ?? []) blocked.add(id)

	return dbx
		.select({ id: users.id, name: users.name, email: users.email })
		.from(users)
		.where(and(ne(users.role, 'child'), notInArray(users.id, Array.from(blocked))))
		.orderBy(asc(users.name), asc(users.email))
}

export async function updateCoGiftersImpl(args: {
	gifterId: string
	input: z.infer<typeof UpdateCoGiftersInputSchema>
	dbx?: SchemaDatabase
}): Promise<UpdateCoGiftersResult> {
	const { gifterId, input: data, dbx = db } = args

	const gift = await dbx.query.giftedItems.findFirst({
		where: eq(giftedItems.id, data.giftId),
		columns: { id: true, gifterId: true, itemId: true },
	})
	if (!gift) return { kind: 'error', reason: 'not-found' }
	if (gift.gifterId !== gifterId) return { kind: 'error', reason: 'not-yours' }

	// D6 guard: reject the recipient, the primary's own partner, and the primary
	// themselves as co-gifters (enforced server-side, not just in the picker).
	if (data.additionalGifterIds.length > 0) {
		const blocked = await blockedCoGifterIds(gifterId, gift.itemId, data.additionalGifterIds, dbx)
		if (data.additionalGifterIds.some(id => blocked.has(id))) return { kind: 'error', reason: 'not-allowed' }
	}

	const ids = data.additionalGifterIds.length > 0 ? data.additionalGifterIds : null

	const [updated] = await dbx
		.update(giftedItems)
		.set({ additionalGifterIds: ids })
		.where(eq(giftedItems.id, data.giftId))
		.returning({ additionalGifterIds: giftedItems.additionalGifterIds })

	// Reset-to-even: the participant set changed, so drop any custom split.
	await clearContributionsForGift(data.giftId, dbx)

	return { kind: 'ok', additionalGifterIds: updated.additionalGifterIds }
}

// ===============================
// CONTRIBUTION SPLIT (custom per-gifter amounts)
// ===============================

// Delete a claim's custom split rows, reverting it to the even split. Called on
// any structural change (totalCost or the participant set) - reset-to-even.
async function clearContributionsForGift(giftId: number, dbx: SchemaDatabase): Promise<void> {
	await dbx.delete(giftContributions).where(eq(giftContributions.giftId, giftId))
}

export const SetContributionSplitInputSchema = z.object({
	giftId: z.number().int().positive(),
	// Co-gifter amounts; the primary's share is the residual. An empty array
	// clears the custom split (revert to even).
	coGifters: z.array(z.object({ userId: z.string(), amount: z.string().regex(/^\d+(\.\d{1,2})?$/) })).max(20),
})

export type SetContributionSplitResult =
	| { kind: 'ok' }
	| { kind: 'error'; reason: 'not-found' | 'not-yours' | 'no-cost' | 'invalid-gifter' | 'exceeds-total' }

// Set (or clear) the custom split on a claim. Only the primary gifter or their
// partner may set it (shared gifter unit). Stores co-gifter amounts only; the
// primary's share is the residual. Rejects amounts that sum past the total, or
// targets that aren't co-gifters on the claim.
export async function setContributionSplitImpl(args: {
	actorId: string
	input: z.infer<typeof SetContributionSplitInputSchema>
	dbx?: SchemaDatabase
}): Promise<SetContributionSplitResult> {
	const { actorId, input, dbx = db } = args
	return dbx.transaction(async (tx): Promise<SetContributionSplitResult> => {
		const gift = await tx.query.giftedItems.findFirst({
			where: eq(giftedItems.id, input.giftId),
			columns: { id: true, gifterId: true, totalCost: true, additionalGifterIds: true },
		})
		if (!gift) return { kind: 'error', reason: 'not-found' }
		if (!(await isPrimaryOrPartner(actorId, gift.gifterId, tx))) return { kind: 'error', reason: 'not-yours' }

		const total = parseTotalCost(gift.totalCost)
		if (total === null) return { kind: 'error', reason: 'no-cost' }

		if (input.coGifters.length === 0) {
			await clearContributionsForGift(gift.id, tx)
			return { kind: 'ok' }
		}

		const coGifterSet = new Set(gift.additionalGifterIds ?? [])
		const seen = new Set<string>()
		for (const c of input.coGifters) {
			if (!coGifterSet.has(c.userId) || seen.has(c.userId)) return { kind: 'error', reason: 'invalid-gifter' }
			seen.add(c.userId)
		}

		const sum = input.coGifters.reduce((s, c) => s + Number(c.amount), 0)
		if (sum > total + 1e-9) return { kind: 'error', reason: 'exceeds-total' }

		await clearContributionsForGift(gift.id, tx)
		await tx.insert(giftContributions).values(input.coGifters.map(c => ({ giftId: gift.id, userId: c.userId, amount: c.amount })))
		return { kind: 'ok' }
	})
}

export type ContributionSplitView = {
	totalCost: string | null
	coGifters: Array<{ id: string; name: string | null; email: string; amount: string }>
}

// The current split for the editor: each co-gifter with their stored amount, or
// the even-split default when none is stored. Returns null when the caller may
// not edit it (not the primary gifter or their partner) or the claim is gone.
export async function getContributionSplitImpl(args: {
	callerId: string
	giftId: number
	dbx?: SchemaDatabase
}): Promise<ContributionSplitView | null> {
	const { callerId, giftId, dbx = db } = args
	const gift = await dbx.query.giftedItems.findFirst({
		where: eq(giftedItems.id, giftId),
		columns: { id: true, gifterId: true, totalCost: true, additionalGifterIds: true },
	})
	if (!gift) return null
	if (!(await isPrimaryOrPartner(callerId, gift.gifterId, dbx))) return null

	const coGifterIds = gift.additionalGifterIds ?? []
	if (coGifterIds.length === 0) return { totalCost: gift.totalCost, coGifters: [] }

	const [userRows, contribRows] = await Promise.all([
		dbx.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, coGifterIds)),
		dbx
			.select({ userId: giftContributions.userId, amount: giftContributions.amount })
			.from(giftContributions)
			.where(eq(giftContributions.giftId, giftId)),
	])
	const userById = new Map(userRows.map(u => [u.id, u]))
	const customByUser = new Map(contribRows.map(c => [c.userId, c.amount]))
	const evenShare = evenUnitShare(gift.totalCost, unitCount(coGifterIds), false)
	const evenStr = evenShare != null ? evenShare.toFixed(2) : '0.00'

	const coGifters = coGifterIds
		.map(id => {
			const u = userById.get(id)
			return u ? { id, name: u.name, email: u.email, amount: customByUser.get(id) ?? evenStr } : null
		})
		.filter((x): x is { id: string; name: string | null; email: string; amount: string } => x !== null)

	return { totalCost: gift.totalCost, coGifters }
}
