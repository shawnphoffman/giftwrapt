import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { toast } from 'sonner'

import {
	applyRecommendation,
	type ApplyRecommendationResult,
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

export const Route = createFileRoute('/(core)/suggestions')({
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

	const applyServerMutation = useMutation({
		mutationFn: (input: { id: string; apply: NonNullable<Parameters<typeof applyRecommendation>[0]>['data']['apply'] }) =>
			applyRecommendation({ data: input }),
		onSuccess: (result: ApplyRecommendationResult) => {
			queryClient.invalidateQueries({ queryKey: intelligenceQueryOptions.queryKey })
			if (!result.ok) toast.error(applyErrorMessage(result.reason))
		},
		onError: e => toast.error(e instanceof Error ? e.message : 'Action failed'),
	})

	const state: IntelligencePageState = useMemo(() => buildState(data, refreshMutation.isPending), [data, refreshMutation.isPending])

	return (
		<IntelligencePageContent
			state={state}
			onRefresh={() => refreshMutation.mutate()}
			onDismiss={rec => dismissMutation.mutate(rec.id)}
			onAction={(rec, action) => {
				// Navigation actions (href) are handled in the rec card as
				// anchor links and never reach this handler. Apply actions
				// run a server mutation that flips the rec to applied on
				// success. Noop actions ("Keep both", "Keep separate") are
				// declines, so they route through dismiss. Anything else
				// would be a bug: the user clicked a button that does
				// nothing, so do nothing instead of silently applying.
				if (action.apply) {
					applyServerMutation.mutate({ id: rec.id, apply: action.apply })
					return
				}
				if (action.intent === 'noop') {
					dismissMutation.mutate(rec.id)
					return
				}
			}}
			onSelectListPicker={rec => applyMutation.mutate(rec.id)}
		/>
	)
}

function applyErrorMessage(reason: Exclude<ApplyRecommendationResult, { ok: true }>['reason']): string {
	switch (reason) {
		case 'rec-not-active':
			return 'This suggestion is no longer active. Refresh to see the latest.'
		case 'cannot-edit':
			return "You can't edit that list anymore."
		case 'items-changed':
			return 'These items have changed since the suggestion was made. Refresh to see the latest.'
		case 'list-not-found':
			return 'That list no longer exists.'
		case 'rec-not-found':
			return 'Suggestion not found.'
		case 'unknown-apply-kind':
			return "We don't know how to apply that action."
	}
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
