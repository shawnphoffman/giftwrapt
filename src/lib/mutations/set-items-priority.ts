import { useMutation, useQueryClient } from '@tanstack/react-query'

import { setItemsPriority } from '@/api/items'
import type { Priority } from '@/db/schema/enums'

import { patchItemsByIds, rollbackItemCache, snapshotItemCache, transformItemCache } from './_items-cache'

export type SetItemsPriorityInput = {
	listId: number
	itemIds: ReadonlyArray<number>
	priority: Priority
}

export function useSetItemsPriority() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (input: SetItemsPriorityInput) =>
			setItemsPriority({ data: { itemIds: [...input.itemIds], priority: input.priority } }),

		onMutate: async input => {
			const snapshot = await snapshotItemCache(queryClient, input.listId)
			transformItemCache(queryClient, input.listId, patchItemsByIds(input.itemIds, { priority: input.priority }))
			return { snapshot }
		},

		onSuccess: (result, _input, ctx) => {
			if (result.kind === 'error') rollbackItemCache(queryClient, ctx.snapshot)
		},

		onError: (_err, _input, ctx) => rollbackItemCache(queryClient, ctx?.snapshot),
	})
}
