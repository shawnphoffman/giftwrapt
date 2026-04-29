import { useMutation, useQueryClient } from '@tanstack/react-query'

import { deleteItem } from '@/api/items'

import { filterOutItemIds, rollbackItemCache, snapshotItemCache, transformItemCache } from './_items-cache'

export type DeleteItemInput = {
	listId: number
	itemId: number
}

export function useDeleteItem() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (input: DeleteItemInput) => deleteItem({ data: { itemId: input.itemId } }),

		onMutate: async input => {
			const snapshot = await snapshotItemCache(queryClient, input.listId)
			transformItemCache(queryClient, input.listId, filterOutItemIds([input.itemId]))
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
