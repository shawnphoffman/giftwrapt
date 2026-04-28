import { useMutation, useQueryClient } from '@tanstack/react-query'

import { type ItemForEditing, type ItemWithGifts, updateItem } from '@/api/items'
import type { Item } from '@/db/schema/items'
import { itemsKeys } from '@/lib/queries/items'

type ItemRowLike = ItemForEditing | ItemWithGifts

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

type Snapshot = ReadonlyArray<readonly [unknown, ReadonlyArray<ItemRowLike> | undefined]>

function patchItemInQueries<T extends ItemRowLike>(items: ReadonlyArray<T>, itemId: number, patch: Partial<Item>): ReadonlyArray<T> {
	return items.map(it => (it.id === itemId ? { ...it, ...patch } : it))
}

export function useUpdateItem() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationKey: ['updateItem'],
		mutationFn: async (input: UpdateItemInput) => {
			const { listId: _listId, ...payload } = input
			return updateItem({ data: payload })
		},

		// Snapshot every items cache for this list, write the optimistic patch
		// into each, return the snapshot for rollback.
		onMutate: async input => {
			const filter = { queryKey: itemsKeys.byList(input.listId) }
			await queryClient.cancelQueries(filter)

			const snapshot = queryClient.getQueriesData<ReadonlyArray<ItemRowLike>>(filter) as Snapshot

			const patch: Partial<Item> = {
				title: input.title,
				url: input.url ?? null,
				price: input.price ?? null,
				notes: input.notes ?? null,
				priority: input.priority,
				quantity: input.quantity,
				imageUrl: input.imageUrl ?? null,
			}

			for (const [key, data] of snapshot) {
				if (!data) continue
				queryClient.setQueryData(key as ReadonlyArray<unknown>, patchItemInQueries(data, input.itemId, patch))
			}

			return { snapshot }
		},

		// Server returned the canonical row — write it into every items cache so
		// any computed-then-stripped fields (e.g. modifiedAt) match server state.
		onSuccess: (result, input, ctx) => {
			if (result.kind === 'error') {
				rollback(queryClient, ctx.snapshot)
				return
			}
			const filter = { queryKey: itemsKeys.byList(input.listId) }
			const current = queryClient.getQueriesData<ReadonlyArray<ItemRowLike>>(filter)
			for (const [key, data] of current) {
				if (!data) continue
				queryClient.setQueryData(key, patchItemInQueries(data, input.itemId, result.item))
			}
		},

		onError: (_err, _input, ctx) => {
			rollback(queryClient, ctx?.snapshot)
		},

		// No onSettled invalidate. Server return is authoritative; SSE catches
		// anything we miss.
	})
}

function rollback(queryClient: ReturnType<typeof useQueryClient>, snapshot: Snapshot | undefined) {
	if (!snapshot) return
	for (const [key, data] of snapshot) {
		queryClient.setQueryData(key as ReadonlyArray<unknown>, data)
	}
}
