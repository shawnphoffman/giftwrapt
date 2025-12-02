import { createCollection } from '@tanstack/db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { z } from 'zod'
import { getContext } from '@/integrations/tanstack-query/root-provider'
import type { BirthMonth } from '@/db/enums'

// Schema matching the API response: users with their public lists
const ListItemSchema = z.object({
	id: z.number(),
	name: z.string(),
	type: z.enum(['wishlist', 'christmas', 'birthday', 'giftideas', 'todos', 'test']),
	isActive: z.boolean(),
	description: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
})

const UserWithListsSchema = z.object({
	id: z.string(),
	email: z.string(),
	name: z.string().nullable(),
	image: z.string().nullable(),
	birthMonth: z.enum([
		'january',
		'february',
		'march',
		'april',
		'may',
		'june',
		'july',
		'august',
		'september',
		'october',
		'november',
		'december',
	]).nullable(),
	birthDay: z.number().nullable(),
	lists: z.array(ListItemSchema),
})

export type UserWithLists = z.infer<typeof UserWithListsSchema>
export type ListItem = z.infer<typeof ListItemSchema>

// Query Collection with automatic sync via TanStack Query
// Provides local-first behavior: data is cached locally and syncs with server
export const usersWithListsCollection = createCollection(
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
		getKey: (user: UserWithLists) => user.id,
		schema: UserWithListsSchema,
	})
)

