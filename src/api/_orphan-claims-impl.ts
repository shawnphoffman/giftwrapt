// Server-only impl for the orphan-claim alert surfaces. An orphan claim
// is a `giftedItems` row whose parent item is in pending-deletion (the
// recipient deleted the item via `deleteItem`; see
// [.notes/plans/2026-04-recipient-deletes-claimed-item.md](../../.notes/plans/2026-04-recipient-deletes-claimed-item.md)).
//
// Three surface points:
//   - `getOrphanedClaimsForList`: powers the beefy alert above the
//     filters on the list-detail page.
//   - `getOrphanedClaimsSummary`: powers the lighter summary on
//     `/purchases` (count per list + link).
//   - `acknowledgeOrphanedClaim`: drops the caller's claim row and (if
//     it was the last claim on the item) hard-deletes the item.

import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { z } from 'zod'

import { db, type SchemaDatabase } from '@/db'
import { giftedItems, items, lists, users } from '@/db/schema'
import { userHasStandingOnClaim } from '@/lib/orphan-claims'
import { cleanupImageUrls } from '@/lib/storage/cleanup'
import { notifyListEvent } from '@/routes/api/sse/list.$listId'

export const GetOrphanedClaimsForListInputSchema = z.object({
	listId: z.number().int().positive(),
})

export const AcknowledgeOrphanedClaimInputSchema = z.object({
	giftId: z.number().int().positive(),
})

// One row per pending-deletion item the caller (or their partner) has a
// claim on. The order is deletion-time ascending so older orphans
// surface first in the alert.
export type OrphanedClaimRow = {
	giftId: number
	itemId: number
	itemTitle: string
	itemUrl: string | null
	itemImageUrl: string | null
	itemPrice: string | null
	itemCurrency: string | null
	quantity: number
	totalCost: string | null
	notes: string | null
	// True when the row credits the viewer's partner as the primary
	// gifter (i.e. they made the purchase, the viewer is the partner). Lets
	// the UI surface the partner identity on the alert row.
	isPartnerPurchase: boolean
	pendingDeletionAt: Date
}

export type OrphanedClaimSummaryRow = {
	listId: number
	listName: string
	listIsActive: boolean
	listOwnerId: string
	recipientKind: 'user' | 'dependent'
	recipientName: string
	count: number
}

export async function getOrphanedClaimsForListImpl(args: {
	userId: string
	listId: number
	dbx?: SchemaDatabase
}): Promise<Array<OrphanedClaimRow>> {
	const { userId, listId, dbx = db } = args

	const me = await dbx.query.users.findFirst({
		where: eq(users.id, userId),
		columns: { partnerId: true },
	})
	const partnerId = me?.partnerId ?? null
	const gifterIds = partnerId ? [userId, partnerId] : [userId]

	const rows = await dbx
		.select({
			giftId: giftedItems.id,
			gifterId: giftedItems.gifterId,
			quantity: giftedItems.quantity,
			totalCost: giftedItems.totalCost,
			notes: giftedItems.notes,
			itemId: items.id,
			itemTitle: items.title,
			itemUrl: items.url,
			itemImageUrl: items.imageUrl,
			itemPrice: items.price,
			itemCurrency: items.currency,
			pendingDeletionAt: items.pendingDeletionAt,
		})
		.from(giftedItems)
		.innerJoin(items, and(eq(items.id, giftedItems.itemId), isNotNull(items.pendingDeletionAt), eq(items.listId, listId)))
		.where(inArray(giftedItems.gifterId, gifterIds))

	return rows
		.filter((r): r is typeof r & { pendingDeletionAt: Date } => r.pendingDeletionAt !== null)
		.sort((a, b) => a.pendingDeletionAt.getTime() - b.pendingDeletionAt.getTime())
		.map(r => ({
			giftId: r.giftId,
			itemId: r.itemId,
			itemTitle: r.itemTitle,
			itemUrl: r.itemUrl,
			itemImageUrl: r.itemImageUrl,
			itemPrice: r.itemPrice,
			itemCurrency: r.itemCurrency,
			quantity: r.quantity,
			totalCost: r.totalCost,
			notes: r.notes,
			isPartnerPurchase: partnerId !== null && r.gifterId === partnerId,
			pendingDeletionAt: r.pendingDeletionAt,
		}))
}

export async function getOrphanedClaimsSummaryImpl(args: {
	userId: string
	dbx?: SchemaDatabase
}): Promise<Array<OrphanedClaimSummaryRow>> {
	const { userId, dbx = db } = args

	const me = await dbx.query.users.findFirst({
		where: eq(users.id, userId),
		columns: { partnerId: true },
	})
	const partnerId = me?.partnerId ?? null
	const gifterIds = partnerId ? [userId, partnerId] : [userId]

	const rows = await dbx
		.select({
			listId: lists.id,
			listName: lists.name,
			listIsActive: lists.isActive,
			listOwnerId: lists.ownerId,
			subjectDependentId: lists.subjectDependentId,
			ownerName: users.name,
			ownerEmail: users.email,
			itemId: items.id,
		})
		.from(giftedItems)
		.innerJoin(items, and(eq(items.id, giftedItems.itemId), isNotNull(items.pendingDeletionAt)))
		.innerJoin(lists, eq(lists.id, items.listId))
		.innerJoin(users, eq(users.id, lists.ownerId))
		.where(inArray(giftedItems.gifterId, gifterIds))

	type Bucket = {
		listId: number
		listName: string
		listIsActive: boolean
		listOwnerId: string
		recipientKind: 'user' | 'dependent'
		recipientName: string
		count: number
	}
	const byList = new Map<number, Bucket>()
	// Resolve dependent names in a second pass so we can keep this query
	// stub-simple (no extra LEFT JOIN aliasing in the typed builder).
	const dependentIds = new Set<string>()
	for (const r of rows) {
		if (r.subjectDependentId) dependentIds.add(r.subjectDependentId)
	}
	const dependentNames = new Map<string, string>()
	if (dependentIds.size > 0) {
		const deps = await dbx.query.dependents.findMany({
			where: (d, { inArray: ia }) => ia(d.id, Array.from(dependentIds)),
			columns: { id: true, name: true },
		})
		for (const d of deps) dependentNames.set(d.id, d.name)
	}

	for (const r of rows) {
		const recipientKind: 'user' | 'dependent' = r.subjectDependentId ? 'dependent' : 'user'
		const recipientName =
			recipientKind === 'dependent' && r.subjectDependentId
				? (dependentNames.get(r.subjectDependentId) ?? 'a dependent')
				: r.ownerName || r.ownerEmail
		const bucket = byList.get(r.listId) ?? {
			listId: r.listId,
			listName: r.listName,
			listIsActive: r.listIsActive,
			listOwnerId: r.listOwnerId,
			recipientKind,
			recipientName,
			count: 0,
		}
		bucket.count += 1
		byList.set(r.listId, bucket)
	}

	return Array.from(byList.values()).sort((a, b) => b.count - a.count)
}

export type AcknowledgeOrphanedClaimResult =
	| { kind: 'ok'; itemDeleted: boolean }
	| { kind: 'error'; reason: 'not-found' | 'not-yours' | 'not-pending-deletion' }

export async function acknowledgeOrphanedClaimImpl(args: {
	userId: string
	input: z.infer<typeof AcknowledgeOrphanedClaimInputSchema>
	dbx?: SchemaDatabase
}): Promise<AcknowledgeOrphanedClaimResult> {
	const { userId, input, dbx = db } = args

	const claim = await dbx.query.giftedItems.findFirst({
		where: eq(giftedItems.id, input.giftId),
		columns: { id: true, itemId: true, gifterId: true, additionalGifterIds: true },
	})
	if (!claim) return { kind: 'error', reason: 'not-found' }

	const hasStanding = await userHasStandingOnClaim(dbx, userId, claim)
	if (!hasStanding) return { kind: 'error', reason: 'not-yours' }

	const item = await dbx.query.items.findFirst({
		where: eq(items.id, claim.itemId),
		columns: { id: true, listId: true, imageUrl: true, pendingDeletionAt: true },
	})
	if (!item) return { kind: 'error', reason: 'not-found' }
	if (item.pendingDeletionAt === null) return { kind: 'error', reason: 'not-pending-deletion' }

	const result = await dbx.transaction(async tx => {
		await tx.delete(giftedItems).where(eq(giftedItems.id, claim.id))
		const remaining = await tx.$count(giftedItems, eq(giftedItems.itemId, claim.itemId))
		let itemDeleted = false
		if (remaining === 0) {
			await tx.delete(items).where(eq(items.id, claim.itemId))
			itemDeleted = true
		}
		return { itemDeleted }
	})

	if (result.itemDeleted) {
		await cleanupImageUrls([item.imageUrl])
	}
	// Notify the list so any open list-detail pages refresh their orphan
	// alert. We use `claim` rather than `item` because the per-list
	// orphan-alert query is what's affected.
	notifyListEvent({ kind: 'claim', listId: item.listId })
	return { kind: 'ok', itemDeleted: result.itemDeleted }
}
