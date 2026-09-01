import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { listAiModelsAsAdmin, type ListAiModelsResult } from '@/api/admin-ai'
import type { ProviderType } from '@/lib/ai-types'

export const aiModelsQueryKey = (providerType: ProviderType | undefined, baseUrl: string) =>
	['adminAiModels', providerType ?? '', baseUrl] as const

type Args = {
	providerType: ProviderType | undefined
	baseUrl: string
	/** False when there is no key to authenticate the catalogue request with. */
	enabled: boolean
}

async function callList(data: {
	providerType?: ProviderType
	baseUrl?: string
	apiKey?: string
	refresh?: boolean
}): Promise<ListAiModelsResult> {
	return await listAiModelsAsAdmin({ data } as Parameters<typeof listAiModelsAsAdmin>[0])
}

/**
 * Live model catalogue for the provider currently selected in the admin form.
 * Cached for an hour on both sides; `refresh` forces a round-trip and can
 * carry unsaved draft credentials so a new key can be tried before saving.
 */
export function useAiModels({ providerType, baseUrl, enabled }: Args) {
	const queryClient = useQueryClient()
	const queryKey = aiModelsQueryKey(providerType, baseUrl)

	const query = useQuery({
		queryKey,
		queryFn: async () => {
			if (!providerType) return { ok: false, error: 'Provider type is required.' } satisfies ListAiModelsResult
			return await callList({ providerType, baseUrl: baseUrl || undefined })
		},
		enabled: enabled && Boolean(providerType),
		staleTime: 60 * 60 * 1000,
		retry: false,
	})

	const [refreshing, setRefreshing] = useState(false)

	const refresh = async (draft?: { apiKey?: string; baseUrl?: string }) => {
		if (!providerType) return
		const effectiveBaseUrl = draft?.baseUrl ?? baseUrl
		setRefreshing(true)
		try {
			const result = await callList({
				providerType,
				baseUrl: effectiveBaseUrl || undefined,
				apiKey: draft?.apiKey,
				refresh: true,
			})
			queryClient.setQueryData(aiModelsQueryKey(providerType, effectiveBaseUrl), result)
		} finally {
			setRefreshing(false)
		}
	}

	return { result: query.data, isLoading: query.isFetching || refreshing, refresh }
}
