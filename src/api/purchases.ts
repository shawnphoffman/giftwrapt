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
	// True when this purchase was made by the current user's partner (primary
	// gifter is the partner, not a co-gifter). Used to surface a partner
	// avatar on the row.
	isPartnerPurchase: boolean
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
	// Recipient identity. For most lists this is the list owner; for
	// dependent-subject lists it's the dependent. `recipientKind` lets
	// the UI tell them apart (e.g. swap the avatar fallback) and
	// `subjectDependentId` is non-null only when the recipient is a
	// dependent.
	recipientKind: 'user' | 'dependent'
	subjectDependentId: string | null
	ownerId: string
	ownerName: string | null
	ownerEmail: string
	ownerImage: string | null
}

export type PurchaseSummary = {
	items: Array<SummaryItem>
	partner: { name: string; image: string | null } | null
}

export const getPurchaseSummary = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(async ({ context }): Promise<PurchaseSummary> => {
		const userId = context.session.user.id

		const currentUser = await db.query.users.findFirst({
			where: eq(users.id, userId),
			columns: { partnerId: true },
		})
		const myPartnerId = currentUser?.partnerId ?? null

		const partnerUser = myPartnerId
			? await db.query.users.findFirst({
					where: eq(users.id, myPartnerId),
					columns: { name: true, email: true, image: true },
				})
			: null
		const partner = partnerUser ? { name: partnerUser.name || partnerUser.email, image: partnerUser.image } : null

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

		// Exclude claims on lists I own personally (gift to myself, dropped),
		// but KEEP claims on lists I created FOR a dependent - the recipient
		// is the dependent, not me.
		const ownerExclude = or(ne(lists.ownerId, userId), sql`${lists.subjectDependentId} IS NOT NULL`)

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
				subjectDependentId: lists.subjectDependentId,
				dependentName: sql<string | null>`dep.name`,
				dependentImage: sql<string | null>`dep.image`,
			})
			.from(giftedItems)
			.innerJoin(items, eq(items.id, giftedItems.itemId))
			.innerJoin(lists, eq(lists.id, items.listId))
			.innerJoin(sql`users as owner`, sql`owner.id = ${lists.ownerId}`)
			.leftJoin(sql`dependents as dep`, sql`dep.id = ${lists.subjectDependentId}`)
			.where(and(claimGifterFilter, ownerExclude))

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
				subjectDependentId: lists.subjectDependentId,
				dependentName: sql<string | null>`dep.name`,
				dependentImage: sql<string | null>`dep.image`,
			})
			.from(listAddons)
			.innerJoin(lists, eq(lists.id, listAddons.listId))
			.innerJoin(sql`users as owner`, sql`owner.id = ${lists.ownerId}`)
			.leftJoin(sql`dependents as dep`, sql`dep.id = ${lists.subjectDependentId}`)
			.where(and(inAddonGifters, ownerExclude))

		// Recipient name resolution: when the list is FOR a dependent, the
		// "recipient" UI surfaces use the dependent's name/avatar instead
		// of the (guardian) owner's. The owner-side fields are still populated
		// (raw owner identity is sometimes useful for debugging / admin views).
		function resolveRecipient<
			T extends {
				subjectDependentId: string | null
				listOwnerName: string | null
				listOwnerEmail: string
				listOwnerImage: string | null
				dependentName: string | null
				dependentImage: string | null
			},
		>(r: T): { recipientKind: 'user' | 'dependent'; ownerName: string | null; ownerEmail: string; ownerImage: string | null } {
			if (r.subjectDependentId) {
				return {
					recipientKind: 'dependent',
					ownerName: r.dependentName,
					ownerEmail: '',
					ownerImage: r.dependentImage,
				}
			}
			return {
				recipientKind: 'user',
				ownerName: r.listOwnerName,
				ownerEmail: r.listOwnerEmail,
				ownerImage: r.listOwnerImage,
			}
		}

		const claims: Array<SummaryItem> = claimRows.map(r => {
			const isPrimary = gifterIds.includes(r.gifterId)
			const isCoGifter = !isPrimary
			const isOwn = r.gifterId === userId
			// Co-gifter spend is unknown per gifter today; zero it out so totals
			// and averages don't double-count the primary's total.
			const cost = isCoGifter ? 0 : r.totalCost ? parseFloat(r.totalCost) : null
			const recipient = resolveRecipient(r)
			return {
				type: 'claim',
				giftId: r.giftId,
				addonId: null,
				isOwn,
				isPartnerPurchase: !isOwn && !isCoGifter && myPartnerId !== null && r.gifterId === myPartnerId,
				isCoGifter,
				title: r.itemTitle,
				itemUrl: r.itemUrl,
				cost,
				totalCostRaw: isCoGifter ? null : r.totalCost,
				notes: r.notes,
				quantity: r.quantity,
				listName: r.listName,
				createdAt: r.createdAt,
				recipientKind: recipient.recipientKind,
				subjectDependentId: r.subjectDependentId,
				ownerId: r.listOwnerId,
				ownerName: recipient.ownerName,
				ownerEmail: recipient.ownerEmail,
				ownerImage: recipient.ownerImage,
			}
		})

		const addons: Array<SummaryItem> = addonRows.map(r => {
			const recipient = resolveRecipient(r)
			return {
				type: 'addon',
				giftId: null,
				addonId: r.addonId,
				isOwn: r.gifterId === userId,
				isPartnerPurchase: r.gifterId !== userId && myPartnerId !== null && r.gifterId === myPartnerId,
				isCoGifter: false,
				title: r.description,
				itemUrl: null,
				cost: r.totalCost ? parseFloat(r.totalCost) : null,
				totalCostRaw: r.totalCost,
				notes: r.notes,
				quantity: 1,
				listName: r.listName,
				createdAt: r.createdAt,
				recipientKind: recipient.recipientKind,
				subjectDependentId: r.subjectDependentId,
				ownerId: r.listOwnerId,
				ownerName: recipient.ownerName,
				ownerEmail: recipient.ownerEmail,
				ownerImage: recipient.ownerImage,
			}
		})

		return { items: [...claims, ...addons], partner }
	})
