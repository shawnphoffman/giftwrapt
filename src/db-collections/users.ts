import { createCollection } from '@tanstack/db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { z } from 'zod'
import { getContext } from '@/integrations/tanstack-query/root-provider'

// Schema matching the user table
const UserSchema = z.object({
	id: z.string(),
	email: z.string(),
	name: z.string().nullable(),
	role: z.string(),
	image: z.string().nullable(),
	isAdmin: z.boolean(),
	createdAt: z.string(),
	updatedAt: z.string(),
})

export type User = z.infer<typeof UserSchema>

// Query Collection with automatic sync via TanStack Query
// Provides local-first behavior: data is cached locally and syncs with server
export const usersCollection = createCollection(
	queryCollectionOptions({
		queryKey: ['admin', 'users'],
		queryFn: async () => {
			const response = await fetch('/api/admin/users')
			if (!response.ok) {
				throw new Error('Failed to fetch users')
			}
			return response.json()
		},
		queryClient: getContext().queryClient,
		getKey: (user: User) => user.id,
		schema: UserSchema,
	})
)
