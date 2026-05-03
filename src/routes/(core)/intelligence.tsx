import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { toast } from 'sonner'

import {
	dismissRecommendation,
	getMyRecommendations,
	type IntelligencePagePayload,
	markRecommendationApplied,
	refreshMyRecommendations,
} from '@/api/intelligence'
import type { IntelligencePageState, Recommendation } from '@/components/intelligence/__fixtures__/types'
import { IntelligencePageContent } from '@/components/intelligence/intelligence-page'

const intelligenceQueryOptions = {
	queryKey: ['intelligence', 'me'] as const,
	queryFn: () => getMyRecommendations(),
	staleTime: 10_000,
}

export const Route = createFileRoute('/(core)/intelligence')({
	loader: ({ context }) => context.queryClient.ensureQueryData(intelligenceQueryOptions),
	component: IntelligenceRoute,
})

function IntelligenceRoute() {
	const { data } = useSuspenseQuery(intelligenceQueryOptions)
	const queryClient = useQueryClient()

	const refreshMutation = useMutation({
		mutationFn: () => refreshMyRecommendations({ data: undefined } as Parameters<typeof refreshMyRecommendations>[0]),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: intelligenceQueryOptions.queryKey }),
		onError: e => toast.error(e instanceof Error ? e.message : 'Refresh failed'),
	})

	const dismissMutation = useMutation({
		mutationFn: (id: string) => dismissRecommendation({ data: { id } }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: intelligenceQueryOptions.queryKey }),
		onError: e => toast.error(e instanceof Error ? e.message : 'Dismiss failed'),
	})

	const applyMutation = useMutation({
		mutationFn: (id: string) => markRecommendationApplied({ data: { id } }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: intelligenceQueryOptions.queryKey }),
	})

	const state: IntelligencePageState = useMemo(() => buildState(data, refreshMutation.isPending), [data, refreshMutation.isPending])

	return (
		<IntelligencePageContent
			state={state}
			onRefresh={() => refreshMutation.mutate()}
			onDismiss={rec => dismissMutation.mutate(rec.id)}
			onAction={rec => applyMutation.mutate(rec.id)}
			onSelectListPicker={rec => applyMutation.mutate(rec.id)}
		/>
	)
}

function buildState(data: IntelligencePagePayload, generating: boolean): IntelligencePageState {
	if (!data.enabled) return { kind: 'disabled', reason: 'feature-disabled' }
	if (!data.providerConfigured) return { kind: 'disabled', reason: 'no-provider' }

	const recs: Array<Recommendation> = data.recs.map(r => {
		const payload = (r.payload ?? {}) as Partial<Recommendation>
		return {
			id: r.id,
			analyzerId: r.analyzerId as Recommendation['analyzerId'],
			kind: r.kind,
			severity: r.severity,
			status: r.status,
			title: r.title,
			body: r.body,
			createdAt: new Date(r.createdAt),
			dismissedAt: r.dismissedAt ? new Date(r.dismissedAt) : null,
			actions: payload.actions,
			dismissDescription: payload.dismissDescription,
			affected: payload.affected,
			relatedLists: payload.relatedLists,
			relatedItems: payload.relatedItems,
			interaction: payload.interaction,
		}
	})

	const baseData = {
		enabled: data.enabled,
		providerConfigured: data.providerConfigured,
		recs,
		lastRun: data.lastRun
			? {
					id: data.lastRun.id,
					startedAt: new Date(data.lastRun.startedAt),
					finishedAt: data.lastRun.finishedAt ? new Date(data.lastRun.finishedAt) : null,
					status: data.lastRun.status,
					trigger: data.lastRun.trigger,
					skipReason: data.lastRun.skipReason,
					error: data.lastRun.error,
				}
			: null,
		nextEligibleRefreshAt: data.nextEligibleRefreshAt ? new Date(data.nextEligibleRefreshAt) : null,
	}

	if (generating) return { kind: 'generating', data: baseData }
	if (data.lastRun?.status === 'error') return { kind: 'error', data: baseData, message: data.lastRun.error ?? 'Unknown error' }
	return { kind: 'loaded', data: baseData }
}
