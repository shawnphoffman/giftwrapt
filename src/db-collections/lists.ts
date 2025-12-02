import { createCollection } from '@tanstack/db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { z } from 'zod'
import { getContext } from '@/integrations/tanstack-query/root-provider'

// Schema matching the Drizzle lists table with owner relation
const ListSchema = z.object({
	id: z.number(),
	name: z.string(),
	type: z.enum(['wishlist', 'christmas', 'birthday', 'giftideas', 'todos', 'test']),
	isActive: z.boolean(),
	isPrivate: z.boolean(),
	description: z.string().nullable(),
	ownerId: z.string(),
	createdAt: z.date().or(z.string()),
	updatedAt: z.date().or(z.string()),
	owner: z.object({
		id: z.string(),
		email: z.string(),
		name: z.string().nullable(),
		image: z.string().nullable(),
	}),
})

export type List = z.infer<typeof ListSchema>

// Query Collection with automatic sync via TanStack Query
// Provides local-first behavior: data is cached locally and syncs with server
export const listsCollection = createCollection(
	queryCollectionOptions({
		queryKey: ['lists', 'public'],
		queryFn: async () => {
			const response = await fetch('/api/lists/public')
			if (!response.ok) {
				throw new Error('Failed to fetch public lists')
			}
			return response.json()
		},
		queryClient: getContext().queryClient,
		getKey: (list: List) => list.id,
		schema: ListSchema,
	})
)

