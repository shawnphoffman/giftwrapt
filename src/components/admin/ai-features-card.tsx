import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { updateAppSettings } from '@/api/settings'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import type { AiConfigResponse } from '@/hooks/use-ai-config'
import { useAiConfig } from '@/hooks/use-ai-config'
import { adminAppSettingsQueryKey, notifyAppSettingsChanged, useAdminAppSettings } from '@/hooks/use-app-settings'
import type { AppSettings } from '@/lib/settings'

function isAiAvailable(aiConfig: AiConfigResponse | undefined): boolean {
	return aiConfig?.isValid === true
}

function useFeatureToggleMutation() {
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
			notifyAppSettingsChanged(queryClient)
			toast.success('Setting updated')
		},
	})
}

export function AiFeaturesCard() {
	const { data: settings, isLoading: settingsLoading } = useAdminAppSettings()
	const { data: aiConfig, isLoading: configLoading } = useAiConfig()
	const mutation = useFeatureToggleMutation()

	if (settingsLoading || configLoading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-2xl">AI Features</CardTitle>
				</CardHeader>
				<CardContent className="text-sm text-muted-foreground">Loading…</CardContent>
			</Card>
		)
	}
	if (!settings) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-2xl">AI Features</CardTitle>
				</CardHeader>
				<CardContent className="text-sm text-muted-foreground">No settings found.</CardContent>
			</Card>
		)
	}

	const aiAvailable = isAiAvailable(aiConfig)
	const inputsDisabled = !aiAvailable || mutation.isPending

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-2xl">AI Features</CardTitle>
				<CardDescription>AI-powered features that depend on the provider above. Disabled until a provider is configured.</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-6">
				<section className="space-y-3">
					<div className="space-y-1">
						<h3 className="text-base font-medium">Scraping</h3>
						<p className="text-sm text-muted-foreground">
							Optional AI title-cleanup post-pass. Runs after the winning provider returns; uses the AI provider configured above. The AI
							scraper itself is configured under{' '}
							<a className="underline" href="/admin/scraping">
								/admin/scraping
							</a>{' '}
							as a typed entry alongside the rest of the providers.
						</p>
					</div>
					<div className="flex items-center justify-between gap-4">
						<div className="space-y-0.5">
							<Label htmlFor="scrapeAiCleanTitlesEnabled" className="text-base">
								Clean imported titles
							</Label>
							<p className="text-sm text-muted-foreground">
								Runs a small AI pass on the winning result to strip retailer noise from the title.
							</p>
						</div>
						<Switch
							id="scrapeAiCleanTitlesEnabled"
							checked={settings.scrapeAiCleanTitlesEnabled}
							disabled={inputsDisabled}
							onCheckedChange={checked => mutation.mutate({ scrapeAiCleanTitlesEnabled: checked } as Partial<AppSettings>)}
						/>
					</div>
				</section>

				<Separator />

				<section className="space-y-3">
					<div className="space-y-1">
						<h3 className="text-base font-medium">Intelligence</h3>
						<p className="text-sm text-muted-foreground">
							Per-user AI recommendations: stale items, duplicates, grouping suggestions, and primary-list nudges. When on, cron generates
							recs and users see the Intelligence page; manual refresh is unlocked. When off, all generation is paused. Configure analyzers,
							scheduling, and history under{' '}
							<a className="underline" href="/admin/intelligence">
								/admin/intelligence
							</a>
							.
						</p>
					</div>
					<div className="flex items-center justify-between gap-4">
						<div className="space-y-0.5">
							<Label htmlFor="intelligenceEnabled" className="text-base">
								Enable Intelligence
							</Label>
							<p className="text-sm text-muted-foreground">
								{settings.intelligenceEnabled
									? 'Recommendations are flowing.'
									: 'All recommendation generation is paused. Users do not see the page.'}
							</p>
						</div>
						<Switch
							id="intelligenceEnabled"
							// size="lg"
							checked={settings.intelligenceEnabled}
							disabled={inputsDisabled}
							onCheckedChange={checked => mutation.mutate({ intelligenceEnabled: checked } as Partial<AppSettings>)}
						/>
					</div>
				</section>

				{!aiAvailable && <p className="text-sm text-muted-foreground">Configure an AI provider above to enable these features.</p>}
			</CardContent>
		</Card>
	)
}
