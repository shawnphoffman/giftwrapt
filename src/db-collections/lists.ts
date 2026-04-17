import { createCollection } from '@tanstack/db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { z } from 'zod'

import { UserSchema } from '@/db/schema/users'
import { getContext } from '@/integrations/tanstack-query/root-provider'

// Schema matching the API response: users with their public lists
const ListSchema = z.object({
	id: z.number(),
	name: z.string(),
	type: z.enum(['wishlist', 'christmas', 'birthday', 'giftideas', 'todos', 'test']),
	isActive: z.boolean(),
	description: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
	itemsTotal: z.number(),
	itemsRemaining: z.number(),
})

const UserWithListsSchema = z.object({
	...UserSchema.shape,
	id: z.string(),
	email: z.string(),
	image: z.string().nullable(),
	// DB returns null for users without a partner; UserSchema.partnerId is
	// z.string().optional() (fine for form input, rejects null from the wire).
	partnerId: z.string().nullish(),
	lists: z.array(ListSchema),
})

export type UserWithLists = z.infer<typeof UserWithListsSchema>
export type List = z.infer<typeof ListSchema>

// Helper to get the API URL (absolute URL for server-side, relative for client-side)
const getApiUrl = (path: string): string => {
	// On the client, relative URLs work fine
	if (typeof window !== 'undefined') {
		return path
	}
	// On the server, we need an absolute URL
	// Use environment variable or default to localhost for development
	const baseUrl = process.env.SERVER_URL || process.env.BETTER_AUTH_URL || 'http://localhost:3000'
	return `${baseUrl}${path}`
}

// Query Collection with automatic sync via TanStack Query
// Provides local-first behavior: data is cached locally and syncs with server
export const usersWithListsCollection = createCollection(
	queryCollectionOptions({
		queryKey: ['lists', 'public', 'grouped'],
		queryFn: async () => {
			const url = getApiUrl('/api/lists/public')
			const response = await fetch(url)
			if (!response.ok) {
				throw new Error('Failed to fetch public lists')
			}
			return response.json()
		},
		queryClient: getContext().queryClient,
		getKey: (user: UserWithLists) => user.id,
		schema: UserWithListsSchema,
	})
)
