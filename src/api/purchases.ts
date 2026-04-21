import { createServerFn } from '@tanstack/react-start'
import { and, arrayOverlaps, desc, eq, ne, or, sql } from 'drizzle-orm'

import { db } from '@/db'
import { giftedItems, items, listAddons, lists, users } from '@/db/schema'
import { loggingMiddleware } from '@/lib/logger'
import { authMiddleware } from '@/middleware/auth'

// ===============================
// READ — my purchases (all claims by current user)
// ===============================
// Returns every claim the current user has made, with the associated item,
// list, and list owner info. Also includes off-list gifts (addons) the user
// created. Sorted by most recent first.

export type PurchaseRow = {
	type: 'claim'
	giftId: number
	itemId: number
	itemTitle: string
	itemUrl: string | null
	itemPrice: string | null
	quantity: number
	totalCost: string | null
	notes: string | null
	createdAt: Date
	listId: number
	listName: string
	listOwnerId: string
	listOwnerName: string | null
	listOwnerEmail: string
	listOwnerImage: string | null
}

export type AddonPurchaseRow = {
	type: 'addon'
	addonId: number
	description: string
	totalCost: string | null
	notes: string | null
	isArchived: boolean
	createdAt: Date
	listId: number
	listName: string
	listOwnerId: string
	listOwnerName: string | null
	listOwnerEmail: string
	listOwnerImage: string | null
}

export type MyPurchasesResult = {
	claims: Array<PurchaseRow>
	addons: Array<AddonPurchaseRow>
}

export const getMyPurchases = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(async ({ context }): Promise<MyPurchasesResult> => {
		const userId = context.session.user.id

		// Fetch all claims by this user with item + list + owner info.
		const claimRows = await db
			.select({
				giftId: giftedItems.id,
				itemId: items.id,
				itemTitle: items.title,
				itemUrl: items.url,
				itemPrice: items.price,
				quantity: giftedItems.quantity,
				totalCost: giftedItems.totalCost,
				notes: giftedItems.notes,
				createdAt: giftedItems.createdAt,
				listId: lists.id,
				listName: lists.name,
				listOwnerId: lists.ownerId,
				listOwnerName: sql<string | null>`owner.name`,
				listOwnerEmail: sql<string>`owner.email`,
				listOwnerImage: sql<string | null>`owner.image`,
			})
			.from(giftedItems)
			.innerJoin(items, eq(items.id, giftedItems.itemId))
			.innerJoin(lists, eq(lists.id, items.listId))
			.innerJoin(sql`users as owner`, sql`owner.id = ${lists.ownerId}`)
			.where(eq(giftedItems.gifterId, userId))
			.orderBy(desc(giftedItems.createdAt))

		const claims: Array<PurchaseRow> = claimRows.map(r => ({
			type: 'claim',
			giftId: r.giftId,
			itemId: r.itemId,
			itemTitle: r.itemTitle,
			itemUrl: r.itemUrl,
			itemPrice: r.itemPrice,
			quantity: r.quantity,
			totalCost: r.totalCost,
			notes: r.notes,
			createdAt: r.createdAt,
			listId: r.listId,
			listName: r.listName,
			listOwnerId: r.listOwnerId,
			listOwnerName: r.listOwnerName,
			listOwnerEmail: r.listOwnerEmail,
			listOwnerImage: r.listOwnerImage,
		}))

		// Fetch all off-list gifts (addons) by this user.
		const addonRows = await db
			.select({
				addonId: listAddons.id,
				description: listAddons.description,
				totalCost: listAddons.totalCost,
				notes: listAddons.notes,
				isArchived: listAddons.isArchived,
				createdAt: listAddons.createdAt,
				listId: lists.id,
				listName: lists.name,
				listOwnerId: lists.ownerId,
				listOwnerName: sql<string | null>`owner.name`,
				listOwnerEmail: sql<string>`owner.email`,
				listOwnerImage: sql<string | null>`owner.image`,
			})
			.from(listAddons)
			.innerJoin(lists, eq(lists.id, listAddons.listId))
			.innerJoin(sql`users as owner`, sql`owner.id = ${lists.ownerId}`)
			.where(eq(listAddons.userId, userId))
			.orderBy(desc(listAddons.createdAt))

		const addons: Array<AddonPurchaseRow> = addonRows.map(r => ({
			type: 'addon',
			addonId: r.addonId,
			description: r.description,
			totalCost: r.totalCost,
			notes: r.notes,
			isArchived: r.isArchived,
			createdAt: r.createdAt,
			listId: r.listId,
			listName: r.listName,
			listOwnerId: r.listOwnerId,
			listOwnerName: r.listOwnerName,
			listOwnerEmail: r.listOwnerEmail,
			listOwnerImage: r.listOwnerImage,
		}))

		return { claims, addons }
	})

// ===============================
// READ — purchase summary (spending per person)
// ===============================
// Returns a flat list of items (claims + addons) by the current user and
// their partner (if any), with owner metadata. Grouping, timeframe
// filtering, and metrics are computed client-side for responsiveness.

export type SummaryItem = {
	type: 'claim' | 'addon'
	giftId: number | null
	addonId: number | null
	isOwn: boolean
	// True when the current user (or their partner) is only a co-gifter on this
	// claim, never the primary. Co-gifter claims are shown with $0 until we
	// build UI to capture per-gifter spend.
	isCoGifter: boolean
	title: string
	cost: number | null
	totalCostRaw: string | null
	notes: string | null
	quantity: number
	listName: string
	createdAt: Date
	ownerId: string
	ownerName: string | null
	ownerEmail: string
	ownerImage: string | null
	ownerPartnerId: string | null
}

export const getPurchaseSummary = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(async ({ context }): Promise<Array<SummaryItem>> => {
		const userId = context.session.user.id

		const currentUser = await db.query.users.findFirst({
			where: eq(users.id, userId),
			columns: { partnerId: true },
		})
		const myPartnerId = currentUser?.partnerId ?? null

		const gifterIds = [userId]
		if (myPartnerId) gifterIds.push(myPartnerId)

		const inGifters =
			gifterIds.length === 1
				? eq(giftedItems.gifterId, userId)
				: sql`${giftedItems.gifterId} IN (${sql.join(
						gifterIds.map(id => sql`${id}`),
						sql`, `
					)})`
		const inAddonGifters =
			gifterIds.length === 1
				? eq(listAddons.userId, userId)
				: sql`${listAddons.userId} IN (${sql.join(
						gifterIds.map(id => sql`${id}`),
						sql`, `
					)})`
		// Either the current user (or their partner) is the primary gifter, or
		// they appear in additionalGifterIds (co-gifter).
		const claimGifterFilter = or(inGifters, arrayOverlaps(giftedItems.additionalGifterIds, gifterIds))

		const claimRows = await db
			.select({
				giftId: giftedItems.id,
				gifterId: giftedItems.gifterId,
				additionalGifterIds: giftedItems.additionalGifterIds,
				itemTitle: items.title,
				quantity: giftedItems.quantity,
				totalCost: giftedItems.totalCost,
				notes: giftedItems.notes,
				createdAt: giftedItems.createdAt,
				listName: lists.name,
				listOwnerId: lists.ownerId,
				listOwnerName: sql<string | null>`owner.name`,
				listOwnerEmail: sql<string>`owner.email`,
				listOwnerImage: sql<string | null>`owner.image`,
				listOwnerPartnerId: sql<string | null>`owner.partner_id`,
			})
			.from(giftedItems)
			.innerJoin(items, eq(items.id, giftedItems.itemId))
			.innerJoin(lists, eq(lists.id, items.listId))
			.innerJoin(sql`users as owner`, sql`owner.id = ${lists.ownerId}`)
			.where(and(claimGifterFilter, ne(lists.ownerId, userId)))

		const addonRows = await db
			.select({
				addonId: listAddons.id,
				gifterId: listAddons.userId,
				description: listAddons.description,
				totalCost: listAddons.totalCost,
				notes: listAddons.notes,
				createdAt: listAddons.createdAt,
				listName: lists.name,
				listOwnerId: lists.ownerId,
				listOwnerName: sql<string | null>`owner.name`,
				listOwnerEmail: sql<string>`owner.email`,
				listOwnerImage: sql<string | null>`owner.image`,
				listOwnerPartnerId: sql<string | null>`owner.partner_id`,
			})
			.from(listAddons)
			.innerJoin(lists, eq(lists.id, listAddons.listId))
			.innerJoin(sql`users as owner`, sql`owner.id = ${lists.ownerId}`)
			.where(and(inAddonGifters, ne(lists.ownerId, userId)))

		const claims: Array<SummaryItem> = claimRows.map(r => {
			const isPrimary = gifterIds.includes(r.gifterId)
			const isCoGifter = !isPrimary
			// Co-gifter spend is unknown per gifter today; zero it out so totals
			// and averages don't double-count the primary's total.
			const cost = isCoGifter ? 0 : r.totalCost ? parseFloat(r.totalCost) : null
			return {
				type: 'claim',
				giftId: r.giftId,
				addonId: null,
				isOwn: r.gifterId === userId,
				isCoGifter,
				title: r.itemTitle,
				cost,
				totalCostRaw: isCoGifter ? null : r.totalCost,
				notes: r.notes,
				quantity: r.quantity,
				listName: r.listName,
				createdAt: r.createdAt,
				ownerId: r.listOwnerId,
				ownerName: r.listOwnerName,
				ownerEmail: r.listOwnerEmail,
				ownerImage: r.listOwnerImage,
				ownerPartnerId: r.listOwnerPartnerId,
			}
		})

		const addons: Array<SummaryItem> = addonRows.map(r => ({
			type: 'addon',
			giftId: null,
			addonId: r.addonId,
			isOwn: r.gifterId === userId,
			isCoGifter: false,
			title: r.description,
			cost: r.totalCost ? parseFloat(r.totalCost) : null,
			totalCostRaw: r.totalCost,
			notes: r.notes,
			quantity: 1,
			listName: r.listName,
			createdAt: r.createdAt,
			ownerId: r.listOwnerId,
			ownerName: r.listOwnerName,
			ownerEmail: r.listOwnerEmail,
			ownerImage: r.listOwnerImage,
			ownerPartnerId: r.listOwnerPartnerId,
		}))

		return [...claims, ...addons]
	})
