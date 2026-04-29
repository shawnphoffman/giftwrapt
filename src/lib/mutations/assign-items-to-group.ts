import { useMutation, useQueryClient } from '@tanstack/react-query'

import { assignItemsToGroup } from '@/api/groups'
import type { Item } from '@/db/schema/items'

import { patchItemsByIds, rollbackItemCache, snapshotItemCache, transformItemCache } from './_items-cache'

export type AssignItemsToGroupInput = {
	listId: number
	itemIds: ReadonlyArray<number>
	groupId: number | null
}

export function useAssignItemsToGroup() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationKey: ['updateItem'],
		mutationFn: async (input: AssignItemsToGroupInput) => {
			return assignItemsToGroup({ data: { itemIds: [...input.itemIds], groupId: input.groupId } })
		},

		onMutate: async input => {
			const snapshot = await snapshotItemCache(queryClient, input.listId)
			const patch: Partial<Item> = input.groupId === null ? { groupId: null, groupSortOrder: null } : { groupId: input.groupId }
			transformItemCache(queryClient, input.listId, patchItemsByIds(input.itemIds, patch))
			return { snapshot }
		},

		onSuccess: (result, _input, ctx) => {
			if (result.kind === 'error') rollbackItemCache(queryClient, ctx.snapshot)
		},

		onError: (_err, _input, ctx) => rollbackItemCache(queryClient, ctx?.snapshot),
	})
}
