import { useMutation, useQueryClient } from '@tanstack/react-query'

import { updateItem } from '@/api/items'
import type { Item } from '@/db/schema/items'
import { httpsUpgradeOrNull } from '@/lib/image-url'

import { type ItemCacheSnapshot, patchItemById, rollbackItemCache, snapshotItemCache, transformItemCache } from './_items-cache'

export type UpdateItemInput = {
	listId: number
	itemId: number
	title?: string
	url?: string | null
	price?: string | null
	notes?: string | null
	priority?: Item['priority']
	quantity?: number
	imageUrl?: string | null
}

export function useUpdateItem() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationKey: ['updateItem'],
		mutationFn: async (input: UpdateItemInput) => {
			const { listId: _listId, ...payload } = input
			return updateItem({ data: payload })
		},

		onMutate: async input => {
			const snapshot = await snapshotItemCache(queryClient, input.listId)
			const patch: Partial<Item> = {
				title: input.title,
				url: input.url ?? null,
				price: input.price ?? null,
				notes: input.notes ?? null,
				priority: input.priority,
				quantity: input.quantity,
				imageUrl: httpsUpgradeOrNull(input.imageUrl ?? null),
			}
			transformItemCache(queryClient, input.listId, patchItemById(input.itemId, patch))
			return { snapshot }
		},

		// Server returned the canonical row — write it into every items cache so
		// any computed-then-stripped fields (e.g. modifiedAt) match server state.
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
