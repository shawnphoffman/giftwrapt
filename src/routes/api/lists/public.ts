import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { desc } from 'drizzle-orm'
import { db } from '@/db'
import { users, lists } from '@/db/schema'

export const Route = createFileRoute('/api/lists/public')({
	server: {
		handlers: {
			GET: async () => {
				// Fetch all users with their public lists
				// Drizzle query API uses the table name from schema, which is 'users'
				const allUsers = await db.query.users.findMany({
					with: {
						lists: {
							where: (lists, { and, eq }) =>
								and(eq(lists.isPrivate, false), eq(lists.isActive, true)),
							orderBy: [desc(lists.createdAt)],
						},
					},
				})

				// Convert dates to ISO strings for JSON serialization and structure the data
				return json(
					allUsers.map(user => ({
						id: user.id,
						email: user.email,
						name: user.name,
						image: user.image,
						birthMonth: user.birthMonth,
						birthDay: user.birthDay,
						lists: (user.lists || []).map(list => ({
							id: list.id,
							name: list.name,
							type: list.type,
							isActive: list.isActive,
							description: list.description,
							createdAt: list.createdAt instanceof Date ? list.createdAt.toISOString() : list.createdAt,
							updatedAt: list.updatedAt instanceof Date ? list.updatedAt.toISOString() : list.updatedAt,
						})),
					}))
				)
			},
		},
	},
})

