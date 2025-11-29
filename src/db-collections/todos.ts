import { createCollection } from '@tanstack/db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { z } from 'zod'
import { getContext } from '@/integrations/tanstack-query/root-provider'

// Schema matching the Drizzle todos table with creator relation
const TodoSchema = z.object({
	id: z.number(),
	title: z.string(),
	status: z.enum(['incomplete', 'complete', 'in_progress']).default('incomplete'),
	isArchived: z.boolean().default(false),
	creatorId: z.string().nullable().optional(),
	createdAt: z.date().or(z.string()),
	updatedAt: z.date().or(z.string()),
	creator: z
		.object({
			id: z.string(),
			email: z.string(),
			displayName: z.string().nullable().optional(),
			image: z.string().nullable().optional(),
		})
		.nullable()
		.optional(),
})

export type Todo = z.infer<typeof TodoSchema>

// Query Collection with automatic sync via TanStack Query
// Provides local-first behavior: data is cached locally and syncs with server
// Version mismatch between @tanstack/db versions (0.4.19 vs 0.4.20) - using type assertion
export const todosCollection = createCollection(
	// @ts-ignore - Version mismatch between @tanstack/db versions
	queryCollectionOptions({
		queryKey: ['todos'],
		queryFn: async () => {
			const response = await fetch('/demo/drizzle-api')
			if (!response.ok) {
				throw new Error('Failed to fetch todos')
			}
			return response.json()
		},
		queryClient: getContext().queryClient,
		getKey: (todo: Todo) => todo.id,
		schema: TodoSchema,
		// Mutation handlers - using type assertions due to version compatibility
		onInsert: async (params: any) => {
			const mutation = params.transaction?.mutations?.[0]
			if (!mutation) {
				throw new Error('Invalid insert mutation')
			}

			// Access the value - mutation structure can vary
			// Try different possible structures: mutation.value, mutation.modified, or mutation itself
			const value = (mutation as any).value || (mutation as any).modified || mutation

			// Extract title from the inserted value
			if (!value || typeof value !== 'object') {
				console.error('Invalid mutation value:', { mutation, value })
				throw new Error('Invalid insert mutation: value must be an object')
			}

			const title = value.title
			if (!title || typeof title !== 'string') {
				console.error('Invalid mutation - missing title:', { mutation, value })
				throw new Error('Invalid insert mutation: title is required and must be a string')
			}

			const response = await fetch('/demo/drizzle-api', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title }),
			})
			if (!response.ok) {
				const errorText = await response.text()
				console.error('Failed to create todo:', errorText)
				throw new Error('Failed to create todo')
			}
			return response.json()
		},
		onUpdate: async (params: any) => {
			const mutation = params.transaction?.mutations?.[0]
			if (!mutation) {
				throw new Error('Invalid update mutation')
			}

			const key = (mutation as any).key || mutation.id
			const value = (mutation as any).value || mutation

			const response = await fetch('/demo/drizzle-api', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: key, ...value }),
			})
			if (!response.ok) {
				throw new Error('Failed to update todo')
			}
			return response.json()
		},
		onDelete: async (params: any) => {
			const mutation = params.transaction?.mutations?.[0]
			if (!mutation) {
				throw new Error('Invalid delete mutation')
			}

			const key = (mutation as any).key || mutation.id

			const response = await fetch('/demo/drizzle-api', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: key }),
			})
			if (!response.ok) {
				throw new Error('Failed to delete todo')
			}
		},
	} as any)
)
