import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { asc } from 'drizzle-orm'
import { db } from '@/db'
import { user } from '@/db/schema'
import { auth } from '@/lib/auth'

export const Route = createFileRoute('/api/admin/users')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				// Get current session
				const session = await auth.api.getSession({
					headers: request.headers,
				})

				// Require authentication
				if (!session?.user?.id) {
					return json({ error: 'Unauthorized' }, { status: 401 })
				}

				// Check if user is admin
				const currentUser = await db.query.user.findFirst({
					where: (users, { eq }) => eq(users.id, session.user.id),
				})

				if (!currentUser?.isAdmin) {
					return json({ error: 'Forbidden' }, { status: 403 })
				}

				// Fetch all users
				const users = await db.query.user.findMany({
					orderBy: [asc(user.name), asc(user.email)],
				})

				// Convert dates to ISO strings for JSON serialization
				return json(
					users.map(u => ({
						id: u.id,
						email: u.email,
						name: u.name,
						role: u.role,
						image: u.image,
						isAdmin: u.isAdmin,
						createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt,
						updatedAt: u.updatedAt instanceof Date ? u.updatedAt.toISOString() : u.updatedAt,
					}))
				)
			},
		},
	},
})
