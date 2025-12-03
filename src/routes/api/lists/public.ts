import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { desc } from 'drizzle-orm'
import { db } from '@/db'
import { lists } from '@/db/schema'
import { auth } from '@/lib/auth'

export const Route = createFileRoute('/api/lists/public')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				// Get current user session - authentication required
				const session = await auth.api.getSession({
					headers: request.headers,
				})

				// Require authentication
				if (!session?.user?.id) {
					throw new Error('Unauthorized')
				}

				const currentUserId = session.user.id

				// Fetch all users with their public (non-private) lists
				// Drizzle query API uses the table name from schema, which is 'users'
				const allUsers = await db.query.users.findMany({
					with: {
						lists: {
							where: (lists, { and, eq }) => and(eq(lists.isPrivate, false), eq(lists.isActive, true)),
							orderBy: [desc(lists.createdAt)],
							with: {
								items: true,
							},
						},
					},
				})

				// Filter out current user
				const filteredUsers = allUsers.filter(user => user.id !== currentUserId)

				// Convert dates to ISO strings for JSON serialization and structure the data
				return json(
					filteredUsers.map(user => ({
						...user,
						// id: user.id,
						// email: user.email,
						// name: user.name,
						// image: user.image,
						// birthMonth: user.birthMonth,
						// birthDay: user.birthDay,
						lists: (user.lists || []).map(list => ({
							...list,
							// id: list.id,
							// name: list.name,
							// type: list.type,
							// isActive: list.isActive,
							// description: list.description,
							itemsTotal: list.items?.length || 0,
							itemsRemaining: list.items?.filter(item => item.status === 'incomplete').length || 0,
							createdAt: list.createdAt instanceof Date ? list.createdAt.toISOString() : list.createdAt,
							updatedAt: list.updatedAt instanceof Date ? list.updatedAt.toISOString() : list.updatedAt,
						})),
					}))
				)
			},
		},
	},
})
