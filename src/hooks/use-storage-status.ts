import { queryOptions, useQuery } from '@tanstack/react-query'

import { fetchStorageStatus } from '@/api/storage-status'

// Storage availability is determined by env at server boot, so it never
// changes within a session. Long stale time; no refetch on focus.
export const storageStatusQueryKey = ['storageStatus'] as const

export const storageStatusQueryOptions = queryOptions({
	queryKey: storageStatusQueryKey,
	queryFn: () => fetchStorageStatus(),
	staleTime: Infinity,
	gcTime: Infinity,
})

export function useStorageStatus() {
	const { data } = useQuery(storageStatusQueryOptions)
	// Default to "configured" when we don't have data yet: the UI will
	// briefly show upload buttons, which is less jarring than a flash of
	// "disabled" banner that goes away. The server fn always returns a
	// definitive answer; actual upload attempts are guarded server-side.
	return { configured: data?.configured ?? true }
}
