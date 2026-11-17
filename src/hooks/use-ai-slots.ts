import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { type AiSlotResponse, type AiSlotsResponse, fetchAiSlotsAsAdmin, updateAiSlotAsAdmin, type UpdateAiSlotInput } from '@/api/admin-ai'

export const aiSlotsQueryKey = ['adminAiSlots'] as const

export const aiSlotsQueryOptions = queryOptions({
	queryKey: aiSlotsQueryKey,
	queryFn: () => fetchAiSlotsAsAdmin(),
	staleTime: 0,
})

export function useAiSlots() {
	return useQuery(aiSlotsQueryOptions)
}

export function useAiSlotMutation() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: async (data: UpdateAiSlotInput) => {
			return await updateAiSlotAsAdmin({ data } as Parameters<typeof updateAiSlotAsAdmin>[0])
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: aiSlotsQueryKey })
		},
	})
}

export type { AiSlotResponse, AiSlotsResponse, UpdateAiSlotInput }
