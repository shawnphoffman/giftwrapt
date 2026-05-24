import { queryOptions, useQuery } from '@tanstack/react-query'

import { getObservabilityStatus } from '@/api/common'

export const observabilityStatusQueryKey = ['observabilityStatus'] as const

export const observabilityStatusQueryOptions = queryOptions({
	queryKey: observabilityStatusQueryKey,
	queryFn: () => getObservabilityStatus(),
	staleTime: Infinity,
	gcTime: Infinity,
})

export function useObservabilityStatus() {
	return useQuery(observabilityStatusQueryOptions)
}
