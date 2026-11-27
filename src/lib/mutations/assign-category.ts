import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'

import { assignCategory } from '@/api/categories'
import { itemsKeys } from '@/lib/queries/items'

import { patchItemsByIds, rollbackItemCache, snapshotItemCache, transformItemCache } from './_items-cache'

export type AssignCategoryInput = {
	listId: number
	categoryId: number | null
	itemIds?: ReadonlyArray<number>
	groupIds?: ReadonlyArray<number>
}

export function useAssignCategory() {
	const queryClient = useQueryClient()
	const router = useRouter()

	return useMutation({
		// Shares the key the row's saving spinner watches.
		mutationKey: ['updateItem'],
		mutationFn: async (input: AssignCategoryInput) =>
			assignCategory({
				data: { categoryId: input.categoryId, itemIds: [...(input.itemIds ?? [])], groupIds: [...(input.groupIds ?? [])] },
			}),

		onMutate: async input => {
			const snapshot = await snapshotItemCache(queryClient, input.listId)
			if (input.itemIds && input.itemIds.length > 0) {
				transformItemCache(queryClient, input.listId, patchItemsByIds(input.itemIds, { categoryId: input.categoryId }))
			}
			return { snapshot }
		},

		onSuccess: (result, _input, ctx) => {
			if (result.kind === 'error') rollbackItemCache(queryClient, ctx.snapshot)
		},

		onError: (_err, _input, ctx) => rollbackItemCache(queryClient, ctx?.snapshot),

		// A group's category lives on the group row, which comes from the
		// route loader, so that refetches too.
		onSettled: async (_result, _err, input) => {
			await Promise.all([router.invalidate(), queryClient.invalidateQueries({ queryKey: itemsKeys.byList(input.listId) })])
		},
	})
}
