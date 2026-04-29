import { useMutation, useQueryClient } from '@tanstack/react-query'

import { deleteItems } from '@/api/items'

import { filterOutItemIds, rollbackItemCache, snapshotItemCache, transformItemCache } from './_items-cache'

export type DeleteItemsInput = {
	listId: number
	itemIds: ReadonlyArray<number>
}

export function useDeleteItems() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (input: DeleteItemsInput) => deleteItems({ data: { itemIds: [...input.itemIds] } }),

		onMutate: async input => {
			const snapshot = await snapshotItemCache(queryClient, input.listId)
			transformItemCache(queryClient, input.listId, filterOutItemIds(input.itemIds))
			return { snapshot }
		},

		onSuccess: (result, _input, ctx) => {
			if (result.kind === 'error') {
				rollbackItemCache(queryClient, ctx.snapshot)
				return
			}
			queryClient.invalidateQueries({ queryKey: ['recent', 'items'] })
		},

		onError: (_err, _input, ctx) => rollbackItemCache(queryClient, ctx?.snapshot),
	})
}
