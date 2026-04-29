import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { updateAppSettings } from '@/api/settings'
import { adminAppSettingsQueryKey, useAdminAppSettings } from '@/hooks/use-app-settings'
import type { AppSettings } from '@/lib/settings'

import { type ScraperProvidersFormChangeKey, ScraperProvidersFormView } from './scraper-providers-form-view'

// Data-aware container around `<ScraperProvidersFormView>`. Wires it up to
// the existing useAppSettings + updateAppSettings infrastructure with the
// optimistic-update / rollback pattern the rest of the admin editors use.

function useScraperProvidersMutation() {
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

export function ScraperProvidersForm() {
	const { data: settings, isLoading } = useAdminAppSettings()
	const mutation = useScraperProvidersMutation()

	if (isLoading) {
		return <div className="text-sm text-muted-foreground">Loading scraping settings…</div>
	}
	if (!settings) {
		return <div className="text-sm text-muted-foreground">No settings found.</div>
	}

	return (
		<ScraperProvidersFormView
			settings={settings}
			disabled={mutation.isPending}
			onChange={<TKey extends ScraperProvidersFormChangeKey>(key: TKey, value: AppSettings[TKey]) =>
				mutation.mutate({ [key]: value } as Partial<AppSettings>)
			}
		/>
	)
}
