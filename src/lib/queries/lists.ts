import { queryOptions } from '@tanstack/react-query'

import { getGiftIdeasForList, type GiftIdeasSource } from '@/api/gift-ideas'
import { type AddonOnList, getListAddons, getListHeader, type ListHeader } from '@/api/lists'

// staleTime: 0 to match the items / list-detail policy. SSE-driven
// invalidations are the source of cross-client freshness; no in-memory
// staleness window is allowed to shadow them.
const STALE_TIME = 0
const GC_TIME = 5 * 60 * 1000

export const listDetailKeys = {
	all: ['list-detail'] as const,
	byList: (listId: number) => [...listDetailKeys.all, listId] as const,
	header: (listId: number) => [...listDetailKeys.byList(listId), 'header'] as const,
	addons: (listId: number) => [...listDetailKeys.byList(listId), 'addons'] as const,
	giftIdeas: (listId: number) => [...listDetailKeys.byList(listId), 'gift-ideas'] as const,
}

export function listHeaderQueryOptions(listId: number) {
	return queryOptions<ListHeader>({
		queryKey: listDetailKeys.header(listId),
		queryFn: async () => {
			const result = await getListHeader({ data: { listId: String(listId) } })
			if (!result) throw new Error('list-not-found')
			return result.list
		},
		staleTime: STALE_TIME,
		gcTime: GC_TIME,
	})
}

export function listAddonsQueryOptions(listId: number) {
	return queryOptions<Array<AddonOnList>>({
		queryKey: listDetailKeys.addons(listId),
		queryFn: async () => {
			const result = await getListAddons({ data: { listId: String(listId) } })
			if (!result) return []
			return result.addons
		},
		staleTime: STALE_TIME,
		gcTime: GC_TIME,
	})
}

// The viewer's gift ideas for this list's recipient (plan 18b). Read with a
// suspense query so the section is server-rendered with the page (no pop-in
// or layout shift). A failure degrades to "no ideas" rather than throwing,
// so this optional section can never break the list page.
export function listGiftIdeasQueryOptions(listId: number) {
	return queryOptions<Array<GiftIdeasSource>>({
		queryKey: listDetailKeys.giftIdeas(listId),
		queryFn: async () => {
			try {
				const result = await getGiftIdeasForList({ data: { listId } })
				return result.sources
			} catch {
				return []
			}
		},
		staleTime: STALE_TIME,
		gcTime: GC_TIME,
	})
}
