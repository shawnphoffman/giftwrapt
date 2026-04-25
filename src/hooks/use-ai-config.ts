import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { type AiConfigResponse, fetchAiConfigAsAdmin, updateAiConfigAsAdmin } from '@/api/admin-ai'

export const aiConfigQueryKey = ['adminAiConfig'] as const

export const aiConfigQueryOptions = queryOptions({
	queryKey: aiConfigQueryKey,
	queryFn: () => fetchAiConfigAsAdmin(),
	staleTime: 0,
})

export function useAiConfig() {
	return useQuery(aiConfigQueryOptions)
}

type UpdatePayload = {
	baseUrl?: string | null
	apiKey?: string | null
	model?: string | null
}

export function useAiConfigMutation() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: async (data: UpdatePayload) => {
			return await updateAiConfigAsAdmin({ data } as Parameters<typeof updateAiConfigAsAdmin>[0])
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: aiConfigQueryKey })
		},
	})
}

export type { AiConfigResponse }
