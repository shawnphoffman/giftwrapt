import { queryOptions } from '@tanstack/react-query'

import { getItemsForListEdit, getItemsForListView, type ItemForEditing, type ItemWithGifts, type SortOption } from '@/api/items'

// staleTime: 0 is the explicit answer to the previous "loader over RQ"
// decision in src/routes/(core)/lists/$listId.tsx. Any invalidation refetches;
// SSE-driven updates are not short-circuited by an in-memory staleness window.
const STALE_TIME = 0
const GC_TIME = 5 * 60 * 1000

export const itemsKeys = {
	all: ['items'] as const,
	byList: (listId: number) => [...itemsKeys.all, listId] as const,
	view: (listId: number, sort: SortOption = 'priority-desc') => [...itemsKeys.byList(listId), 'view', sort] as const,
	edit: (listId: number, includeArchived = false) => [...itemsKeys.byList(listId), 'edit', includeArchived] as const,
}

export function listItemsViewQueryOptions(listId: number, sort: SortOption = 'priority-desc') {
	return queryOptions<Array<ItemWithGifts>>({
		queryKey: itemsKeys.view(listId, sort),
		queryFn: async () => {
			const result = await getItemsForListView({ data: { listId: String(listId), sort } })
			if (result.kind === 'error') {
				// is-owner / not-visible / not-found — the route loader handles
				// the user-facing redirect / 404. Return [] so the page renders
				// without items rather than crashing the suspense boundary.
				return []
			}
			return result.items
		},
		staleTime: STALE_TIME,
		gcTime: GC_TIME,
	})
}

export function listItemsEditQueryOptions(listId: number, includeArchived = false) {
	return queryOptions<Array<ItemForEditing>>({
		queryKey: itemsKeys.edit(listId, includeArchived),
		queryFn: async () => {
			const result = await getItemsForListEdit({ data: { listId: String(listId), includeArchived } })
			if (result.kind === 'error') {
				return []
			}
			return result.items
		},
		staleTime: STALE_TIME,
		gcTime: GC_TIME,
	})
}
