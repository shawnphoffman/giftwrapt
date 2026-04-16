import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq } from 'drizzle-orm'

import { db } from '@/db'
import { giftedItems, items, listAddons, lists, users } from '@/db/schema'
import { authMiddleware } from '@/middleware/auth'

// ===============================
// READ — received gifts (archived items on user's lists)
// ===============================
// After items are archived, the recipient can see who gifted them.
// This surfaces gifter info that was hidden during spoiler protection.

export type ReceivedGiftRow = {
	type: 'item'
	itemId: number
	itemTitle: string
	itemImageUrl: string | null
	itemPrice: string | null
	listId: number
	listName: string
	gifterName: string | null
	gifterEmail: string
	quantity: number
	archivedAt: Date
}

export type ReceivedAddonRow = {
	type: 'addon'
	addonId: number
	description: string
	totalCost: string | null
	listId: number
	listName: string
	gifterName: string | null
	gifterEmail: string
	archivedAt: Date
}

export type ReceivedGiftsResult = {
	gifts: Array<ReceivedGiftRow>
	addons: Array<ReceivedAddonRow>
}

export const getReceivedGifts = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.handler(async ({ context }): Promise<ReceivedGiftsResult> => {
		const userId = context.session.user.id

		// Fetch archived items on user's lists with gifter info.
		const giftRows = await db
			.select({
				itemId: items.id,
				itemTitle: items.title,
				itemImageUrl: items.imageUrl,
				itemPrice: items.price,
				listId: lists.id,
				listName: lists.name,
				gifterName: users.name,
				gifterEmail: users.email,
				quantity: giftedItems.quantity,
				archivedAt: items.updatedAt,
			})
			.from(giftedItems)
			.innerJoin(items, and(eq(items.id, giftedItems.itemId), eq(items.isArchived, true)))
			.innerJoin(lists, and(eq(lists.id, items.listId), eq(lists.ownerId, userId)))
			.innerJoin(users, eq(users.id, giftedItems.gifterId))
			.orderBy(desc(items.updatedAt))

		const gifts: Array<ReceivedGiftRow> = giftRows.map(r => ({
			type: 'item',
			itemId: r.itemId,
			itemTitle: r.itemTitle,
			itemImageUrl: r.itemImageUrl,
			itemPrice: r.itemPrice,
			listId: r.listId,
			listName: r.listName,
			gifterName: r.gifterName,
			gifterEmail: r.gifterEmail,
			quantity: r.quantity,
			archivedAt: r.archivedAt,
		}))

		// Fetch archived addons on user's lists.
		const addonRows = await db
			.select({
				addonId: listAddons.id,
				description: listAddons.description,
				totalCost: listAddons.totalCost,
				listId: lists.id,
				listName: lists.name,
				gifterName: users.name,
				gifterEmail: users.email,
				archivedAt: listAddons.createdAt,
			})
			.from(listAddons)
			.innerJoin(lists, and(eq(lists.id, listAddons.listId), eq(lists.ownerId, userId)))
			.innerJoin(users, eq(users.id, listAddons.userId))
			.where(eq(listAddons.isArchived, true))
			.orderBy(desc(listAddons.createdAt))

		const addons: Array<ReceivedAddonRow> = addonRows.map(r => ({
			type: 'addon',
			addonId: r.addonId,
			description: r.description,
			totalCost: r.totalCost,
			listId: r.listId,
			listName: r.listName,
			gifterName: r.gifterName,
			gifterEmail: r.gifterEmail,
			archivedAt: r.archivedAt,
		}))

		return { gifts, addons }
	})
