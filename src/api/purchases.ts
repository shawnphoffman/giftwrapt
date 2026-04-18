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
// Groups spending by list owner (the person being gifted to).
// Partners are grouped together when both users have partnerId set to each other.

export type PersonSummary = {
	userId: string
	name: string | null
	email: string
	/** Combined with partner if applicable */
	partnerUserId: string | null
	partnerName: string | null
	claimCount: number
	addonCount: number
	totalSpent: number
	items: Array<{
		type: 'claim' | 'addon'
		title: string
		cost: number | null
		quantity: number
		listName: string
	}>
}

export const getPurchaseSummary = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.handler(async ({ context }): Promise<Array<PersonSummary>> => {
		const userId = context.session.user.id

		// Fetch current user's partner.
		const currentUser = await db.query.users.findFirst({
			where: eq(users.id, userId),
			columns: { partnerId: true },
		})
		const myPartnerId = currentUser?.partnerId ?? null

		// Fetch partner's claims too if partner exists, so we can combine.
		const gifterIds = [userId]
		if (myPartnerId) gifterIds.push(myPartnerId)

		// Fetch all claims by user (and partner if applicable).
		const claimRows = await db
			.select({
				gifterId: giftedItems.gifterId,
				itemTitle: items.title,
				quantity: giftedItems.quantity,
				totalCost: giftedItems.totalCost,
				listName: lists.name,
				listOwnerId: lists.ownerId,
				listOwnerName: sql<string | null>`owner.name`,
				listOwnerEmail: sql<string>`owner.email`,
				listOwnerPartnerId: sql<string | null>`owner.partner_id`,
			})
			.from(giftedItems)
			.innerJoin(items, eq(items.id, giftedItems.itemId))
			.innerJoin(lists, eq(lists.id, items.listId))
			.innerJoin(sql`users as owner`, sql`owner.id = ${lists.ownerId}`)
			.where(
				gifterIds.length === 1
					? eq(giftedItems.gifterId, userId)
					: sql`${giftedItems.gifterId} IN (${sql.join(gifterIds.map(id => sql`${id}`), sql`, `)})`
			)

		// Fetch all addons by user (and partner).
		const addonRows = await db
			.select({
				gifterId: listAddons.userId,
				description: listAddons.description,
				totalCost: listAddons.totalCost,
				listName: lists.name,
				listOwnerId: lists.ownerId,
				listOwnerName: sql<string | null>`owner.name`,
				listOwnerEmail: sql<string>`owner.email`,
				listOwnerPartnerId: sql<string | null>`owner.partner_id`,
			})
			.from(listAddons)
			.innerJoin(lists, eq(lists.id, listAddons.listId))
			.innerJoin(sql`users as owner`, sql`owner.id = ${lists.ownerId}`)
			.where(
				gifterIds.length === 1
					? eq(listAddons.userId, userId)
					: sql`${listAddons.userId} IN (${sql.join(gifterIds.map(id => sql`${id}`), sql`, `)})`
			)

		// Group by recipient. Partners (mutual partnerId) are merged into one group.
		const groupMap = new Map<string, PersonSummary>()

		function getGroupKey(ownerId: string, ownerPartnerId: string | null): string {
			// If the owner and their partner are both recipients, merge them.
			if (ownerPartnerId && groupMap.has(ownerPartnerId)) {
				return ownerPartnerId
			}
			return ownerId
		}

		function ensureGroup(ownerId: string, ownerName: string | null, ownerEmail: string, ownerPartnerId: string | null): PersonSummary {
			const key = getGroupKey(ownerId, ownerPartnerId)
			let group = groupMap.get(key)
			if (!group) {
				group = {
					userId: ownerId,
					name: ownerName,
					email: ownerEmail,
					partnerUserId: null,
					partnerName: null,
					claimCount: 0,
					addonCount: 0,
					totalSpent: 0,
					items: [],
				}
				groupMap.set(ownerId, group)
			}
			// If this is the partner entry, store partner info.
			if (key !== ownerId && ownerPartnerId) {
				group.partnerUserId = ownerId
				group.partnerName = ownerName
			}
			return group
		}

		for (const row of claimRows) {
			const group = ensureGroup(row.listOwnerId, row.listOwnerName, row.listOwnerEmail, row.listOwnerPartnerId)
			const cost = row.totalCost ? parseFloat(row.totalCost) : null
			group.claimCount++
			if (cost) group.totalSpent += cost
			group.items.push({
				type: 'claim',
				title: row.itemTitle,
				cost,
				quantity: row.quantity,
				listName: row.listName,
			})
		}

		for (const row of addonRows) {
			const group = ensureGroup(row.listOwnerId, row.listOwnerName, row.listOwnerEmail, row.listOwnerPartnerId)
			const cost = row.totalCost ? parseFloat(row.totalCost) : null
			group.addonCount++
			if (cost) group.totalSpent += cost
			group.items.push({
				type: 'addon',
				title: row.description,
				cost,
				quantity: 1,
				listName: row.listName,
			})
		}

		// Sort by total spent descending.
		return Array.from(groupMap.values()).sort((a, b) => b.totalSpent - a.totalSpent)
	})
