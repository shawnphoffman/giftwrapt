import { useMutation, useQueryClient } from '@tanstack/react-query'

import { deleteGroups } from '@/api/items'

import { filterOutItemsInGroups, rollbackItemCache, snapshotItemCache, transformItemCache } from './_items-cache'

export type DeleteGroupsInput = {
	listId: number
	groupIds: ReadonlyArray<number>
}

// Optimistic only at the items-cache level: items inside the deleted groups
// disappear from the list immediately. Group rows live in the route loader's
// list data, so the caller is still responsible for refreshing that
// (router.invalidate) after the mutation settles.
export function useDeleteGroups() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (input: DeleteGroupsInput) => deleteGroups({ data: { groupIds: [...input.groupIds] } }),

		onMutate: async input => {
			const snapshot = await snapshotItemCache(queryClient, input.listId)
			transformItemCache(queryClient, input.listId, filterOutItemsInGroups(input.groupIds))
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
