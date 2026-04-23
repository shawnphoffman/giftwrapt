import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { type EmailConfigResponse, fetchEmailConfigAsAdmin, updateEmailConfigAsAdmin } from '@/api/admin-email'
import { isEmailConfiguredQueryKey } from '@/hooks/use-is-email-configured'

export const emailConfigQueryKey = ['adminEmailConfig'] as const

export const emailConfigQueryOptions = queryOptions({
	queryKey: emailConfigQueryKey,
	queryFn: () => fetchEmailConfigAsAdmin(),
	staleTime: 0,
})

export function useEmailConfig() {
	return useQuery(emailConfigQueryOptions)
}

type UpdatePayload = {
	apiKey?: string | null
	fromEmail?: string | null
	fromName?: string | null
	bccAddress?: string | null
}

export function useEmailConfigMutation() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: async (data: UpdatePayload) => {
			return await updateEmailConfigAsAdmin({ data } as Parameters<typeof updateEmailConfigAsAdmin>[0])
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: emailConfigQueryKey })
			queryClient.invalidateQueries({ queryKey: isEmailConfiguredQueryKey })
		},
	})
}

export type { EmailConfigResponse }
