import { queryOptions } from '@tanstack/react-query'

import { getMyGiftExchangeCount, getMyGiftExchanges } from '@/api/my-gift-exchanges'

// Everyone's Gift Exchange page and its sidebar link. A reveal invalidates
// `all`, so the page shows the person and the count stays in step.
export const myGiftExchangesKeys = {
	all: ['gift-exchanges', 'me'] as const,
	page: () => [...myGiftExchangesKeys.all, 'page'] as const,
	count: () => [...myGiftExchangesKeys.all, 'count'] as const,
}

export function myGiftExchangesQueryOptions() {
	return queryOptions({
		queryKey: myGiftExchangesKeys.page(),
		queryFn: () => getMyGiftExchanges(),
		staleTime: 10_000,
	})
}

/** Cheap COUNT for the sidebar link, refetched on the same cadence as the Suggestions one. */
export function myGiftExchangeCountQueryOptions() {
	return queryOptions({
		queryKey: myGiftExchangesKeys.count(),
		queryFn: () => getMyGiftExchangeCount(),
		staleTime: 30_000,
	})
}
