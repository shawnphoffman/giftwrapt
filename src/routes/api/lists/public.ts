import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { desc } from 'drizzle-orm'

import { db } from '@/db'
import { lists, userRelationships } from '@/db/schema'
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

				// Fetch users (excluding current user and denied owners) with their public (non-private) lists
				const allUsers = await db.query.users.findMany({
					where: (us, { and, ne, notInArray }) =>
						deniedOwnerIds.length > 0 ? and(ne(us.id, currentUserId), notInArray(us.id, deniedOwnerIds)) : ne(us.id, currentUserId),
					with: {
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
					allUsers.map(user => ({
						...user,
						// id: user.id,
						// email: user.email,
						// name: user.name,
						// image: user.image,
						// birthMonth: user.birthMonth,
						// birthDay: user.birthDay,
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
					}))
				)
			},
		},
	},
})
