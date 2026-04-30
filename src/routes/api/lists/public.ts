import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { arrayOverlaps, desc, eq, inArray, max, or } from 'drizzle-orm'

import { db } from '@/db'
import { giftedItems, items, lists, users } from '@/db/schema'
import { auth } from '@/lib/auth'
import { computeListItemCounts } from '@/lib/gifts'

export const Route = createFileRoute('/api/lists/public')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				// Get current user session - authentication required
				const session = await auth.api.getSession({
					headers: request.headers,
				})

				// Require authentication
				if (!session?.user.id) {
					throw new Error('Unauthorized')
				}

				const currentUserId = session.user.id

				// Find owners who explicitly denied the current viewer
				const deniedRelationships = await db.query.userRelationships.findMany({
					where: (rel, { and, eq }) => and(eq(rel.viewerUserId, currentUserId), eq(rel.canView, false)),
					columns: {
						ownerUserId: true,
					},
				})

				const deniedOwnerIds = deniedRelationships.map(rel => rel.ownerUserId)

				// Resolve the requesting user's partner so claim credit follows the
				// "gifts credit both partners" contract (see src/api/received.ts).
				const me = await db.query.users.findFirst({
					where: eq(users.id, currentUserId),
					columns: { partnerId: true },
				})
				const gifterIds: Array<string> = me?.partnerId ? [currentUserId, me.partnerId] : [currentUserId]

				// Per-recipient most-recent claim where the current user OR their
				// partner is the primary gifter, OR either appears in
				// additionalGifterIds as a co-gifter. Powers the "have I gifted
				// them recently?" indicator on the iOS upcoming-birthdays widget.
				// Single grouped query; gifted_items_gifterId_idx covers the
				// primary-gifter lookup, the additionalGifterIds overlap is a
				// linear scan (low row count, acceptable).
				const lastGiftedRows = await db
					.select({
						recipientId: lists.ownerId,
						lastGiftedAt: max(giftedItems.createdAt),
					})
					.from(giftedItems)
					.innerJoin(items, eq(items.id, giftedItems.itemId))
					.innerJoin(lists, eq(lists.id, items.listId))
					.where(or(inArray(giftedItems.gifterId, gifterIds), arrayOverlaps(giftedItems.additionalGifterIds, gifterIds)))
					.groupBy(lists.ownerId)
				const lastGiftedByUserId = new Map<string, Date | null>(lastGiftedRows.map(r => [r.recipientId, r.lastGiftedAt]))

				// Fetch users (excluding current user and denied owners) with their public (non-private) lists
				const allUsers = await db.query.users.findMany({
					where: (us, { and, ne, notInArray }) =>
						deniedOwnerIds.length > 0 ? and(ne(us.id, currentUserId), notInArray(us.id, deniedOwnerIds)) : ne(us.id, currentUserId),
					with: {
						// Surface each user's partner so the UI can label list groups
						// as "Alice & Bob" without a second round-trip.
						partner: { columns: { id: true, name: true, email: true, image: true } },
						lists: {
							where: (l, { and, eq }) => and(eq(l.isPrivate, false), eq(l.isActive, true)),
							orderBy: [desc(lists.createdAt)],
							with: {
								items: {
									with: {
										gifts: { columns: { quantity: true } },
									},
								},
							},
						},
					},
				})

				// Convert dates to ISO strings for JSON serialization and structure the data
				return json(
					allUsers.map(user => {
						const lastGiftedAt = lastGiftedByUserId.get(user.id) ?? null
						return {
							...user,
							lastGiftedAt: lastGiftedAt instanceof Date ? lastGiftedAt.toISOString() : lastGiftedAt,
							lists: user.lists.map(list => {
								const { items, ...rest } = list
								const { total, unclaimed } = computeListItemCounts(items)
								return {
									...rest,
									itemsTotal: total,
									itemsRemaining: unclaimed,
									createdAt: list.createdAt instanceof Date ? list.createdAt.toISOString() : list.createdAt,
									updatedAt: list.updatedAt instanceof Date ? list.updatedAt.toISOString() : list.updatedAt,
								}
							}),
						}
					})
				)
			},
		},
	},
})
