import { createServerFn } from '@tanstack/react-start'
import { desc, eq, sql } from 'drizzle-orm'

import { db } from '@/db'
import { giftedItems, items, listAddons, lists, users } from '@/db/schema'
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
	.middleware([authMiddleware])
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
	title: string
	cost: number | null
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
	.middleware([authMiddleware])
	.handler(async ({ context }): Promise<Array<SummaryItem>> => {
		const userId = context.session.user.id

		const currentUser = await db.query.users.findFirst({
			where: eq(users.id, userId),
			columns: { partnerId: true },
		})
		const myPartnerId = currentUser?.partnerId ?? null

		const gifterIds = [userId]
		if (myPartnerId) gifterIds.push(myPartnerId)

		const inGifters = gifterIds.length === 1
			? eq(giftedItems.gifterId, userId)
			: sql`${giftedItems.gifterId} IN (${sql.join(gifterIds.map(id => sql`${id}`), sql`, `)})`
		const inAddonGifters = gifterIds.length === 1
			? eq(listAddons.userId, userId)
			: sql`${listAddons.userId} IN (${sql.join(gifterIds.map(id => sql`${id}`), sql`, `)})`

		const claimRows = await db
			.select({
				itemTitle: items.title,
				quantity: giftedItems.quantity,
				totalCost: giftedItems.totalCost,
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
			.where(inGifters)

		const addonRows = await db
			.select({
				description: listAddons.description,
				totalCost: listAddons.totalCost,
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
			.where(inAddonGifters)

		const claims: Array<SummaryItem> = claimRows.map(r => ({
			type: 'claim',
			title: r.itemTitle,
			cost: r.totalCost ? parseFloat(r.totalCost) : null,
			quantity: r.quantity,
			listName: r.listName,
			createdAt: r.createdAt,
			ownerId: r.listOwnerId,
			ownerName: r.listOwnerName,
			ownerEmail: r.listOwnerEmail,
			ownerImage: r.listOwnerImage,
			ownerPartnerId: r.listOwnerPartnerId,
		}))

		const addons: Array<SummaryItem> = addonRows.map(r => ({
			type: 'addon',
			title: r.description,
			cost: r.totalCost ? parseFloat(r.totalCost) : null,
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
