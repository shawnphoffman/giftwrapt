import { createServerFn } from '@tanstack/react-start'
import { and, arrayOverlaps, eq, ne, or, sql } from 'drizzle-orm'

import { db } from '@/db'
import { giftedItems, items, listAddons, lists, users } from '@/db/schema'
import { loggingMiddleware } from '@/lib/logger'
import { authMiddleware } from '@/middleware/auth'

// ===============================
// READ - purchase summary (spending per person)
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
	itemUrl: string | null
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
				itemUrl: items.url,
				quantity: giftedItems.quantity,
				totalCost: giftedItems.totalCost,
				notes: giftedItems.notes,
				createdAt: giftedItems.createdAt,
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
				itemUrl: r.itemUrl,
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
			}
		})

		const addons: Array<SummaryItem> = addonRows.map(r => ({
			type: 'addon',
			giftId: null,
			addonId: r.addonId,
			isOwn: r.gifterId === userId,
			isCoGifter: false,
			title: r.description,
			itemUrl: null,
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
		}))

		return [...claims, ...addons]
	})
