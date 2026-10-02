// Receipt attachments on claims and off-list gifts.
//
// Receipts are private to the gifter's unit: the gifter, their partner, and
// co-gifters (and co-gifters' partners), never the recipient. Storage keys are
// kept in `purchase_attachments` and never reach a client; `attachmentUrls`
// holds `/api/receipts/<id>.<ext>`, which the receipts route serves only after
// `loadReceiptForViewerImpl` approves the viewer.

import { and, eq, sql } from 'drizzle-orm'

import { db, type SchemaDatabase } from '@/db'
import { giftedItems, items, listAddons, lists, purchaseAttachments, users } from '@/db/schema'
import { newReceiptId, receiptUrl } from '@/lib/receipts'
import type { PurchaseAttachmentExt, PurchaseAttachmentKind } from '@/lib/storage/keys'
import { isUserBanned } from '@/lib/user-ban'
import { LIMITS } from '@/lib/validation/limits'

export type AttachReceiptResult = { kind: 'ok'; url: string } | { kind: 'gone' } | { kind: 'over' }

// Records an uploaded receipt and appends its URL to the purchase, in one
// transaction with the purchase row locked so two concurrent uploads cannot
// overwrite each other's append or slip past the per-purchase cap. The caller
// has already uploaded the object to `storageKey`; on a non-ok result it should
// delete it.
export async function attachReceiptImpl(args: {
	userId: string
	purchaseKind: PurchaseAttachmentKind
	purchaseId: number
	storageKey: string
	contentType: string
	ext: PurchaseAttachmentExt
	dbx?: SchemaDatabase
}): Promise<AttachReceiptResult> {
	const { userId, purchaseKind, purchaseId, storageKey, contentType, ext, dbx = db } = args
	const id = newReceiptId()
	const url = receiptUrl(id, ext)

	return dbx.transaction(async tx => {
		const locked = (
			purchaseKind === 'claim'
				? await tx.execute(sql`SELECT attachment_urls FROM gifted_items WHERE id = ${purchaseId} AND gifter_id = ${userId} FOR UPDATE`)
				: await tx.execute(sql`SELECT attachment_urls FROM list_addons WHERE id = ${purchaseId} AND user_id = ${userId} FOR UPDATE`)
		) as { rows: Array<{ attachment_urls: Array<string> | null }> }
		const row = locked.rows.at(0)
		if (!row) return { kind: 'gone' as const }
		const current = row.attachment_urls ?? []
		if (current.length >= LIMITS.PURCHASE_ATTACHMENTS_MAX) return { kind: 'over' as const }

		await tx.insert(purchaseAttachments).values({
			id,
			giftId: purchaseKind === 'claim' ? purchaseId : null,
			addonId: purchaseKind === 'addon' ? purchaseId : null,
			storageKey,
			contentType,
		})
		const next = [...current, url]
		if (purchaseKind === 'claim') await tx.update(giftedItems).set({ attachmentUrls: next }).where(eq(giftedItems.id, purchaseId))
		else await tx.update(listAddons).set({ attachmentUrls: next }).where(eq(listAddons.id, purchaseId))
		return { kind: 'ok' as const, url }
	})
}

// Drops a receipt row that belongs to the given purchase and returns its
// storage key so the caller can delete the object. Null when the id is not a
// receipt of that purchase (already removed, or someone else's).
export async function detachReceiptImpl(args: {
	receiptId: string
	purchaseKind: PurchaseAttachmentKind
	purchaseId: number
	dbx?: SchemaDatabase
}): Promise<{ storageKey: string } | null> {
	const { receiptId, purchaseKind, purchaseId, dbx = db } = args
	const owner = purchaseKind === 'claim' ? eq(purchaseAttachments.giftId, purchaseId) : eq(purchaseAttachments.addonId, purchaseId)
	const removed = await dbx
		.delete(purchaseAttachments)
		.where(and(eq(purchaseAttachments.id, receiptId), owner))
		.returning({ storageKey: purchaseAttachments.storageKey })
	return removed.at(0) ?? null
}

// Who may open a receipt. Mirrors the gifter-set predicate in
// getPurchaseSummaryImpl (src/api/_purchases-impl.ts), which decides whose
// purchases, and so whose receipts, appear on a viewer's purchases page:
//   - gifterIds = [viewer, viewer's partner]
//   - a claim matches when its gifter is in gifterIds or its co-gifters overlap them
//   - an addon matches when its gifter is in gifterIds
//   - never on a list the viewer owns, unless the list is for a dependent
// Returns null (the route answers 404) for a missing receipt, a banned
// viewer, or anyone outside that set.
export async function loadReceiptForViewerImpl(
	viewerId: string,
	receiptId: string,
	dbx: SchemaDatabase = db
): Promise<{ storageKey: string; contentType: string } | null> {
	const viewer = await dbx.query.users.findFirst({
		where: eq(users.id, viewerId),
		columns: { partnerId: true, banned: true, banExpires: true },
	})
	if (!viewer || isUserBanned(viewer)) return null
	const gifterIds = new Set([viewerId, ...(viewer.partnerId ? [viewer.partnerId] : [])])

	const receipt = await dbx.query.purchaseAttachments.findFirst({
		where: eq(purchaseAttachments.id, receiptId),
		columns: { storageKey: true, contentType: true, giftId: true, addonId: true },
	})
	if (!receipt) return null

	let listOwner: { ownerId: string; subjectDependentId: string | null } | undefined
	let inGifterSet = false
	if (receipt.giftId !== null) {
		const claimRows = await dbx
			.select({
				gifterId: giftedItems.gifterId,
				additionalGifterIds: giftedItems.additionalGifterIds,
				ownerId: lists.ownerId,
				subjectDependentId: lists.subjectDependentId,
			})
			.from(giftedItems)
			.innerJoin(items, eq(items.id, giftedItems.itemId))
			.innerJoin(lists, eq(lists.id, items.listId))
			.where(eq(giftedItems.id, receipt.giftId))
		const claim = claimRows.at(0)
		if (!claim) return null
		inGifterSet = gifterIds.has(claim.gifterId) || (claim.additionalGifterIds ?? []).some(id => gifterIds.has(id))
		listOwner = claim
	} else if (receipt.addonId !== null) {
		const addonRows = await dbx
			.select({ userId: listAddons.userId, ownerId: lists.ownerId, subjectDependentId: lists.subjectDependentId })
			.from(listAddons)
			.innerJoin(lists, eq(lists.id, listAddons.listId))
			.where(eq(listAddons.id, receipt.addonId))
		const addon = addonRows.at(0)
		if (!addon) return null
		inGifterSet = gifterIds.has(addon.userId)
		listOwner = addon
	}
	if (!inGifterSet || !listOwner) return null
	if (listOwner.ownerId === viewerId && !listOwner.subjectDependentId) return null

	return { storageKey: receipt.storageKey, contentType: receipt.contentType }
}
