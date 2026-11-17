import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import { testAiConnectionAsAdmin } from '@/api/admin-ai'
import { updateAppSettings } from '@/api/settings'
import { type AiConfigResponse, useAiConfig } from '@/hooks/use-ai-config'
import { useAiModels } from '@/hooks/use-ai-models'
import { type AiSlotResponse, useAiSlotMutation, useAiSlots } from '@/hooks/use-ai-slots'
import { adminAppSettingsQueryKey, notifyAppSettingsChanged, useAdminAppSettings } from '@/hooks/use-app-settings'
import { hasKnownRate, type ModelRate } from '@/lib/ai-cost'
import { AI_FEATURE_REGISTRY } from '@/lib/ai-features'
import { AI_EXTRA_SLOTS, type AiExtraSlot } from '@/lib/ai-slots'
import type { AppSettings } from '@/lib/settings'

import { AiSlotCard, type AiSlotCatalogueTarget, type AiSlotTestBody } from './ai-slot-card'
import type { ModelPickerStatus } from './model-picker'

const SLOT_COPY: Record<AiExtraSlot, { title: string; description: string }> = {
	fast: {
		title: 'Fast Model',
		description: 'Optional. A smaller, cheaper model for mechanical work that runs often.',
	},
	vision: {
		title: 'Vision Model',
		description: 'Optional. A model that reads images, for features that send a photo.',
	},
}

function featuresFor(slot: AiExtraSlot): Array<string> {
	return AI_FEATURE_REGISTRY.filter(f => f.slots.includes(slot)).map(f => (f.slots.length > 1 ? `${f.label} (parts of it)` : f.label))
}

// The optional model slots under the main provider card on /admin/ai.
export function AiSlotCards() {
	const { data: main } = useAiConfig()
	const { data: slots } = useAiSlots()
	const { data: settings } = useAdminAppSettings()

	if (!main || !slots) return null
	// Slots refine a working setup; they are noise before there is one.
	if (!main.isValid && AI_EXTRA_SLOTS.every(s => slots[s].mode === 'inherited')) return null

	return (
		<>
			{AI_EXTRA_SLOTS.map(slot => (
				<SlotCardContainer key={slot} slot={slot} config={slots[slot]} main={main} rates={settings?.aiModelRates} />
			))}
		</>
	)
}

function SlotCardContainer({
	slot,
	config,
	main,
	rates,
}: {
	slot: AiExtraSlot
	config: AiSlotResponse
	main: AiConfigResponse
	rates: AppSettings['aiModelRates'] | undefined
}) {
	const mutation = useAiSlotMutation()
	const queryClient = useQueryClient()
	const [target, setTarget] = useState<AiSlotCatalogueTarget | null>(null)

	// The saved key that can authenticate a model listing: the slot's own
	// while it keeps its saved provider type, otherwise the main one.
	const savedKeyFits = target?.ownProvider
		? config.apiKey.source !== 'missing' && config.providerType.value === target.providerType
		: main.apiKey.source !== 'missing'

	const { result, isLoading, refresh } = useAiModels({
		providerType: target?.providerType,
		baseUrl: target?.baseUrl ?? '',
		enabled: Boolean(target) && !target?.custom && savedKeyFits,
		slot: target?.ownProvider ? slot : undefined,
	})

	const modelsStatus: ModelPickerStatus = isLoading
		? { kind: 'loading' }
		: result?.ok
			? { kind: 'live', count: result.models.length, fetchedAt: result.fetchedAt }
			: result
				? { kind: 'error', error: result.error }
				: { kind: 'idle' }

	const rateMutation = useMutation({
		mutationFn: async (next: AppSettings['aiModelRates']) =>
			updateAppSettings({ data: { aiModelRates: next } } as Parameters<typeof updateAppSettings>[0]),
		onSuccess: data => {
			queryClient.setQueryData<AppSettings>(adminAppSettingsQueryKey, old => (old ? { ...old, aiModelRates: data.aiModelRates } : old))
			notifyAppSettingsChanged(queryClient)
			toast.success('Price saved')
		},
		onError: err => toast.error(err instanceof Error ? err.message : 'Failed to save the price'),
	})

	const copy = SLOT_COPY[slot]

	return (
		<AiSlotCard
			slot={slot}
			title={copy.title}
			description={copy.description}
			features={featuresFor(slot)}
			config={config}
			main={main}
			saving={mutation.isPending}
			onSave={async input => {
				const res = await mutation.mutateAsync(input)
				if (!res.ok) {
					toast.error(res.error)
					return
				}
				toast.success(input.model === null && input.provider === null ? `${copy.title} cleared` : `${copy.title} saved`)
			}}
			onTest={async (body: AiSlotTestBody) => {
				const res = await testAiConnectionAsAdmin({ data: body } as Parameters<typeof testAiConnectionAsAdmin>[0])
				if (res.ok) toast.success(`${copy.title} OK (${res.latencyMs} ms)`)
				else toast.error(res.error)
				return res
			}}
			models={result?.ok ? result.models : []}
			modelsStatus={modelsStatus}
			onRefreshModels={draft => void refresh(draft)}
			onCatalogueTargetChange={setTarget}
			rate={
				rates
					? {
							isKnown: model => hasKnownRate(model),
							valueFor: model => rates[model] as ModelRate | undefined,
							pending: rateMutation.isPending,
							onSave: (model, next) => {
								const updated = { ...rates }
								if (next) updated[model] = next
								else delete updated[model]
								rateMutation.mutate(updated)
							},
						}
					: undefined
			}
		/>
	)
}
