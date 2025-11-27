import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { todos } from '@/db/schema'
import { auth } from '@/lib/auth'

export const Route = createFileRoute('/demo/drizzle-api')({
	server: {
		handlers: {
			GET: async () => {
				// Fetch all todos from Drizzle with creator relation
				const todosData = await db.query.todos.findMany({
					orderBy: [desc(todos.createdAt)],
					with: {
						creator: true,
					},
				})

				// Convert dates to ISO strings for JSON serialization
				return json(
					todosData.map(todo => ({
						...todo,
						createdAt: todo.createdAt instanceof Date ? todo.createdAt.toISOString() : todo.createdAt,
						updatedAt: todo.updatedAt instanceof Date ? todo.updatedAt.toISOString() : todo.updatedAt,
					}))
				)
			},
			POST: async ({ request }) => {
				// Get current session to set creatorId
				const session = await auth.api.getSession({
					headers: request.headers,
				})

				// Require authentication to create todos
				if (!session?.user?.id) {
					return json({ error: 'Unauthorized' }, { status: 401 })
				}

				// Insert new todo
				const data = await request.json()
				const [newTodo] = await db
					.insert(todos)
					.values({
						title: data.title,
						status: data.status ?? 'incomplete',
						isArchived: data.isArchived ?? false,
						creatorId: session.user.id,
					})
					.returning()

				// Fetch with creator relation
				const todoWithCreator = await db.query.todos.findFirst({
					where: (todos, { eq }) => eq(todos.id, newTodo.id),
					with: {
						creator: true,
					},
				})

				if (!todoWithCreator) {
					return json({ error: 'Failed to fetch created todo' }, { status: 500 })
				}

				return json({
					...todoWithCreator,
					createdAt: todoWithCreator.createdAt instanceof Date ? todoWithCreator.createdAt.toISOString() : todoWithCreator.createdAt,
					updatedAt: todoWithCreator.updatedAt instanceof Date ? todoWithCreator.updatedAt.toISOString() : todoWithCreator.updatedAt,
				})
			},
			PUT: async ({ request }) => {
				// Update existing todo
				const { id, ...data } = await request.json()
				const [updatedTodo] = await db
					.update(todos)
					.set({
						title: data.title,
						status: data.status,
						isArchived: data.isArchived,
						// creatorId should not be changeable via update
					})
					.where(eq(todos.id, id))
					.returning()

				// Fetch with creator relation
				const todoWithCreator = await db.query.todos.findFirst({
					where: (todos, { eq }) => eq(todos.id, updatedTodo.id),
					with: {
						creator: true,
					},
				})

				if (!todoWithCreator) {
					return json({ error: 'Failed to fetch updated todo' }, { status: 500 })
				}

				return json({
					...todoWithCreator,
					createdAt: todoWithCreator.createdAt instanceof Date ? todoWithCreator.createdAt.toISOString() : todoWithCreator.createdAt,
					updatedAt: todoWithCreator.updatedAt instanceof Date ? todoWithCreator.updatedAt.toISOString() : todoWithCreator.updatedAt,
				})
			},
			DELETE: async ({ request }) => {
				// Delete todo
				const { id } = await request.json()
				await db.delete(todos).where(eq(todos.id, id))
				return json({ success: true })
			},
		},
	},
})
