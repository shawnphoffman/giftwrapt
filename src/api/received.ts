import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, inArray } from 'drizzle-orm'

import { db } from '@/db'
import { giftedItems, items, listAddons, lists, users } from '@/db/schema'
import { namesForGifter, type PartneredUser } from '@/lib/gifters'
import { loggingMiddleware } from '@/lib/logger'
import { authMiddleware } from '@/middleware/auth'

// ===============================
// READ — received gifts (archived items on user's lists)
// ===============================
// After items are archived, the recipient can see who gifted them.
// This surfaces gifter info that was hidden during spoiler protection.
// Each gifter is shown alongside their partner when one is set, matching
// the settings page promise that gifts credit both partners.

export type ReceivedGiftRow = {
	type: 'item'
	itemId: number
	itemTitle: string
	itemImageUrl: string | null
	itemPrice: string | null
	listId: number
	listName: string
	// Every person credited on the claim: primary gifter, their partner (if any),
	// each co-gifter, and each co-gifter's partner. De-duplicated display names.
	gifterNames: Array<string>
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
	gifterNames: Array<string>
	archivedAt: Date
}

export type ReceivedGiftsResult = {
	gifts: Array<ReceivedGiftRow>
	addons: Array<ReceivedAddonRow>
}

export const getReceivedGifts = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(async ({ context }): Promise<ReceivedGiftsResult> => {
		const userId = context.session.user.id

		const giftRows = await db
			.select({
				itemId: items.id,
				itemTitle: items.title,
				itemImageUrl: items.imageUrl,
				itemPrice: items.price,
				listId: lists.id,
				listName: lists.name,
				gifterId: giftedItems.gifterId,
				additionalGifterIds: giftedItems.additionalGifterIds,
				quantity: giftedItems.quantity,
				archivedAt: items.updatedAt,
			})
			.from(giftedItems)
			.innerJoin(items, and(eq(items.id, giftedItems.itemId), eq(items.isArchived, true)))
			.innerJoin(lists, and(eq(lists.id, items.listId), eq(lists.ownerId, userId)))
			.orderBy(desc(items.updatedAt))

		const addonRows = await db
			.select({
				addonId: listAddons.id,
				description: listAddons.description,
				totalCost: listAddons.totalCost,
				listId: lists.id,
				listName: lists.name,
				gifterId: listAddons.userId,
				archivedAt: listAddons.createdAt,
			})
			.from(listAddons)
			.innerJoin(lists, and(eq(lists.id, listAddons.listId), eq(lists.ownerId, userId)))
			.where(eq(listAddons.isArchived, true))
			.orderBy(desc(listAddons.createdAt))

		// Resolve the initial pool of gifter userIds referenced by claims + addons.
		const seedIds = new Set<string>()
		for (const row of giftRows) {
			seedIds.add(row.gifterId)
			for (const id of row.additionalGifterIds ?? []) seedIds.add(id)
		}
		for (const row of addonRows) seedIds.add(row.gifterId)

		const userLookup = new Map<string, PartneredUser>()
		if (seedIds.size > 0) {
			const rows = await db
				.select({ id: users.id, name: users.name, email: users.email, partnerId: users.partnerId })
				.from(users)
				.where(inArray(users.id, Array.from(seedIds)))
			for (const r of rows) userLookup.set(r.id, r)
		}

		// Fetch any partners referenced by the seed pool that aren't already loaded.
		const partnerIds = new Set<string>()
		for (const u of userLookup.values()) {
			if (u.partnerId && !userLookup.has(u.partnerId)) partnerIds.add(u.partnerId)
		}
		if (partnerIds.size > 0) {
			const rows = await db
				.select({ id: users.id, name: users.name, email: users.email, partnerId: users.partnerId })
				.from(users)
				.where(inArray(users.id, Array.from(partnerIds)))
			for (const r of rows) userLookup.set(r.id, r)
		}

		function collectNames(primaryId: string, additionalIds: Array<string> | null): Array<string> {
			const out: Array<string> = []
			for (const name of namesForGifter(primaryId, userLookup)) out.push(name)
			for (const id of additionalIds ?? []) {
				for (const name of namesForGifter(id, userLookup)) out.push(name)
			}
			return out
		}

		const gifts: Array<ReceivedGiftRow> = giftRows.map(r => ({
			type: 'item',
			itemId: r.itemId,
			itemTitle: r.itemTitle,
			itemImageUrl: r.itemImageUrl,
			itemPrice: r.itemPrice,
			listId: r.listId,
			listName: r.listName,
			gifterNames: collectNames(r.gifterId, r.additionalGifterIds),
			quantity: r.quantity,
			archivedAt: r.archivedAt,
		}))

		const addons: Array<ReceivedAddonRow> = addonRows.map(r => ({
			type: 'addon',
			addonId: r.addonId,
			description: r.description,
			totalCost: r.totalCost,
			listId: r.listId,
			listName: r.listName,
			gifterNames: collectNames(r.gifterId, null),
			archivedAt: r.archivedAt,
		}))

		return { gifts, addons }
	})
