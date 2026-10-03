import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { Fragment } from 'react'
import { toast } from 'sonner'

import { updateAppSettings } from '@/api/settings'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import type { AiConfigResponse } from '@/hooks/use-ai-config'
import { useAiConfig } from '@/hooks/use-ai-config'
import { adminAppSettingsQueryKey, notifyAppSettingsChanged, useAdminAppSettings } from '@/hooks/use-app-settings'
import { AI_FEATURE_REGISTRY, type AiFeatureInfo } from '@/lib/ai-features'
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

// The "what is sent" disclosure for one feature. The copy comes from the
// registry in src/lib/ai-features.ts so it cannot drift from the toggles.
function AiDataDisclosure({ feature }: { feature: AiFeatureInfo }) {
	return (
		<Collapsible>
			<CollapsibleTrigger className="group flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline">
				<ChevronRight className="size-4 transition-transform group-data-[state=open]:rotate-90" aria-hidden />
				What is sent to the AI provider
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="mt-2 space-y-3 rounded-md border p-3 text-sm">
					<div className="space-y-1">
						<p className="font-medium">Sent</p>
						<ul className="list-disc space-y-1 pl-4 text-muted-foreground">
							{feature.sent.map(line => (
								<li key={line}>{line}</li>
							))}
						</ul>
					</div>
					<div className="space-y-1">
						<p className="font-medium">Never Sent</p>
						<ul className="list-disc space-y-1 pl-4 text-muted-foreground">
							{feature.neverSent.map(line => (
								<li key={line}>{line}</li>
							))}
						</ul>
					</div>
				</div>
			</CollapsibleContent>
		</Collapsible>
	)
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

	return (
		<AiFeaturesCardView
			settings={settings}
			aiAvailable={isAiAvailable(aiConfig)}
			pending={mutation.isPending}
			onToggle={(key, checked) => mutation.mutate({ [key]: checked } as Partial<AppSettings>)}
		/>
	)
}

type AiFeatureSettingKey = NonNullable<AiFeatureInfo['settingKey']>

export function AiFeaturesCardView({
	settings,
	aiAvailable,
	pending,
	onToggle,
}: {
	// Only the toggles the registry names are read.
	settings: Partial<Record<AiFeatureSettingKey, boolean>>
	aiAvailable: boolean
	pending: boolean
	onToggle: (key: AiFeatureSettingKey, checked: boolean) => void
}) {
	const inputsDisabled = !aiAvailable || pending

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-2xl">AI Features</CardTitle>
				<CardDescription>
					Each feature below uses the provider above and can be switched on its own. Open “What is sent” to see exactly what leaves this
					deployment for that feature. Nothing runs until a provider is configured.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-6">
				{AI_FEATURE_REGISTRY.map((feature, index) => {
					const key = feature.settingKey
					return (
						<Fragment key={feature.id}>
							{index > 0 && <Separator />}
							<section className="space-y-3">
								<div className="flex items-start justify-between gap-4">
									<div className="space-y-0.5">
										<Label htmlFor={key ?? undefined} className="text-base">
											{feature.label}
										</Label>
										<p className="text-sm text-muted-foreground">
											{feature.description}
											{feature.managedAt && (
												<>
													{' '}
													{key ? 'More options under' : 'Turned on and off under'}{' '}
													<a className="underline" href={feature.managedAt.href}>
														{feature.managedAt.label}
													</a>
													.
												</>
											)}
										</p>
									</div>
									{key && (
										<Switch
											id={key}
											checked={settings[key] ?? false}
											disabled={inputsDisabled}
											onCheckedChange={checked => onToggle(key, checked)}
										/>
									)}
								</div>
								<AiDataDisclosure feature={feature} />
							</section>
						</Fragment>
					)
				})}

				{!aiAvailable && <p className="text-sm text-muted-foreground">Configure an AI provider above to enable these features.</p>}
			</CardContent>
		</Card>
	)
}
