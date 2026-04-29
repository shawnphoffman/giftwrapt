import { useMutation, useQueryClient } from '@tanstack/react-query'

import { setItemAvailability } from '@/api/items'
import type { Availability } from '@/db/schema/enums'
import type { Item } from '@/db/schema/items'

import { type ItemCacheSnapshot, patchItemById, rollbackItemCache, snapshotItemCache, transformItemCache } from './_items-cache'

export type ToggleItemAvailabilityInput = {
	listId: number
	itemId: number
	availability: Availability
}

export function useToggleItemAvailability() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationKey: ['updateItem'],
		mutationFn: async (input: ToggleItemAvailabilityInput) => {
			return setItemAvailability({ data: { itemId: input.itemId, availability: input.availability } })
		},

		onMutate: async input => {
			const snapshot = await snapshotItemCache(queryClient, input.listId)
			const patch: Partial<Item> = {
				availability: input.availability,
				availabilityChangedAt: new Date(),
			}
			transformItemCache(queryClient, input.listId, patchItemById(input.itemId, patch))
			return { snapshot }
		},

		onSuccess: (result, input, ctx: { snapshot: ItemCacheSnapshot }) => {
			if (result.kind === 'error') {
				rollbackItemCache(queryClient, ctx.snapshot)
				return
			}
			transformItemCache(queryClient, input.listId, patchItemById(input.itemId, result.item))
		},

		onError: (_err, _input, ctx) => rollbackItemCache(queryClient, ctx?.snapshot),
	})
}
