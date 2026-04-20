import { queryOptions, useQuery } from '@tanstack/react-query'

import { isEmailConfigured } from '@/api/common'

export const isEmailConfiguredQueryKey = ['isEmailConfigured'] as const

export const isEmailConfiguredQueryOptions = queryOptions({
	queryKey: isEmailConfiguredQueryKey,
	queryFn: () => isEmailConfigured(),
	staleTime: Infinity,
	gcTime: Infinity,
})

export function useIsEmailConfigured() {
	return useQuery(isEmailConfiguredQueryOptions)
}
