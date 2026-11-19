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
import { m } from '@/paraglide/messages.js'

import { AiSlotCard, type AiSlotCatalogueTarget, type AiSlotTestBody } from './ai-slot-card'
import type { ModelPickerStatus } from './model-picker'

// Each slot's card text and toasts. One whole message per slot, so no
// sentence is built around the slot's name.
function slotCopy(slot: AiExtraSlot): {
	title: string
	description: string
	saved: string
	cleared: string
	testOk: (latency: number) => string
} {
	switch (slot) {
		case 'fast':
			return {
				title: m.admin_ai_slot_fast_title(),
				description: m.admin_ai_slot_fast_description(),
				saved: m.admin_ai_slot_fast_saved(),
				cleared: m.admin_ai_slot_fast_cleared(),
				testOk: latency => m.admin_ai_slot_fast_test_ok({ latency }),
			}
		case 'vision':
			return {
				title: m.admin_ai_slot_vision_title(),
				description: m.admin_ai_slot_vision_description(),
				saved: m.admin_ai_slot_vision_saved(),
				cleared: m.admin_ai_slot_vision_cleared(),
				testOk: latency => m.admin_ai_slot_vision_test_ok({ latency }),
			}
	}
}

function featuresFor(slot: AiExtraSlot): Array<string> {
	return AI_FEATURE_REGISTRY.filter(f => f.slots.includes(slot)).map(f =>
		f.slots.length > 1 ? m.admin_ai_slot_feature_partial({ feature: f.label() }) : f.label()
	)
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
			toast.success(m.admin_ai_slot_price_saved())
		},
		onError: err => toast.error(err instanceof Error ? err.message : m.admin_ai_slot_price_save_failed()),
	})

	const copy = slotCopy(slot)

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
				toast.success(input.model === null && input.provider === null ? copy.cleared : copy.saved)
			}}
			onTest={async (body: AiSlotTestBody) => {
				const res = await testAiConnectionAsAdmin({ data: body } as Parameters<typeof testAiConnectionAsAdmin>[0])
				if (res.ok) toast.success(copy.testOk(res.latencyMs))
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
