import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { updateAppSettings } from '@/api/settings'
import type { AiConfigResponse } from '@/hooks/use-ai-config'
import { useAiConfig } from '@/hooks/use-ai-config'
import { adminAppSettingsQueryKey, useAdminAppSettings } from '@/hooks/use-app-settings'
import type { AppSettings } from '@/lib/settings'

import { AiScrapingSectionView } from './ai-scraping-section-view'

// Data-aware container. Reads settings + AI config from the existing query
// hooks and persists changes via the same mutation pattern as the rest of
// the admin editors.

function isAiAvailable(aiConfig: AiConfigResponse | undefined): boolean {
	return aiConfig?.isValid === true
}

function useScrapingTogglesMutation() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: async (changes: Partial<AppSettings>) => {
			return updateAppSettings({ data: changes } as Parameters<typeof updateAppSettings>[0])
		},
		onMutate: async changes => {
			await queryClient.cancelQueries({ queryKey: adminAppSettingsQueryKey })
			const previous = queryClient.getQueryData<AppSettings>(adminAppSettingsQueryKey)
			if (previous) {
				queryClient.setQueryData<AppSettings>(adminAppSettingsQueryKey, { ...previous, ...changes })
			}
			return { previous, changedKeys: Object.keys(changes) as Array<keyof AppSettings> }
		},
		onError: (err, _changes, ctx) => {
			if (ctx?.previous) queryClient.setQueryData(adminAppSettingsQueryKey, ctx.previous)
			toast.error(err instanceof Error ? err.message : 'Failed to update setting')
		},
		onSuccess: (data, _vars, ctx) => {
			queryClient.setQueryData<AppSettings>(adminAppSettingsQueryKey, old => {
				if (!old) return old
				const next = { ...old }
				for (const key of ctx.changedKeys) {
					;(next as Record<string, unknown>)[key] = data[key]
				}
				return next
			})
			toast.success('Setting updated')
		},
	})
}

export function AiScrapingSection() {
	const { data: settings, isLoading: settingsLoading } = useAdminAppSettings()
	const { data: aiConfig, isLoading: configLoading } = useAiConfig()
	const mutation = useScrapingTogglesMutation()

	if (settingsLoading || configLoading) {
		return <div className="text-sm text-muted-foreground">Loading scraping settings…</div>
	}
	if (!settings) {
		return <div className="text-sm text-muted-foreground">No settings found.</div>
	}

	return (
		<AiScrapingSectionView
			scrapeAiCleanTitlesEnabled={settings.scrapeAiCleanTitlesEnabled}
			aiAvailable={isAiAvailable(aiConfig)}
			disabled={mutation.isPending}
			onChange={(key, value) => mutation.mutate({ [key]: value } as Partial<AppSettings>)}
		/>
	)
}
