import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { toast } from 'sonner'

import {
	applyRecommendation,
	type ApplyRecommendationResult,
	dismissRecommendation,
	dismissRecommendationSubItem,
	getMyRecommendations,
	type IntelligenceDependentRecGroup,
	type IntelligencePagePayload,
	type IntelligenceRecRow,
	reactivateRecommendation,
	refreshMyRecommendations,
} from '@/api/intelligence'
import type { IntelligencePageState, Recommendation } from '@/components/intelligence/__fixtures__/types'
import { type DependentRecGroup, IntelligencePageContent } from '@/components/intelligence/intelligence-page'
import { coerceLegacyAction } from '@/lib/intelligence/coerce-legacy-action'

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

	const reactivateMutation = useMutation({
		mutationFn: (id: string) => reactivateRecommendation({ data: { id } }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: intelligenceQueryOptions.queryKey }),
		onError: e => toast.error(e instanceof Error ? e.message : 'Reactivate failed'),
	})

	const dismissSubItemMutation = useMutation({
		mutationFn: (input: { id: string; subItemId: string }) => dismissRecommendationSubItem({ data: input }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: intelligenceQueryOptions.queryKey }),
		onError: e => toast.error(e instanceof Error ? e.message : 'Skip failed'),
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
	const dependentGroups: Array<DependentRecGroup> = useMemo(() => buildDependentGroups(data.byDependent), [data.byDependent])

	// Per-rec pending set so each card can lock interactions while its
	// own apply/dismiss is in flight. We track the in-flight id from
	// each mutation's `variables` rather than a separate state hook so
	// the lock auto-clears on settle without an extra effect.
	const pendingRecIds = useMemo(() => {
		const ids = new Set<string>()
		if (applyServerMutation.isPending) ids.add(applyServerMutation.variables.id)
		if (dismissMutation.isPending) ids.add(dismissMutation.variables)
		return ids
	}, [applyServerMutation.isPending, applyServerMutation.variables, dismissMutation.isPending, dismissMutation.variables])

	return (
		<IntelligencePageContent
			state={state}
			dependentGroups={dependentGroups}
			pendingRecIds={pendingRecIds}
			onRefresh={() => refreshMutation.mutate()}
			onDismiss={rec => dismissMutation.mutate(rec.id)}
			onReactivate={rec => reactivateMutation.mutate(rec.id)}
			onAction={(rec, action) => {
				// Navigation actions (nav) are handled in the rec card as
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
			onSelectListPicker={(rec, listId) => applyServerMutation.mutate({ id: rec.id, apply: { kind: 'set-primary-list', listId } })}
			onDismissSubItem={(rec, subItemId) => dismissSubItemMutation.mutate({ id: rec.id, subItemId })}
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
		case 'items-have-claims':
			return 'One of these items has a claim now, so we left it alone. Refresh to see the latest.'
		case 'list-not-found':
			return 'That list no longer exists.'
		case 'invalid-list-type':
			return "That list type can't be set as primary."
		case 'not-owner':
			return "You don't own that list."
		case 'rec-not-found':
			return 'Suggestion not found.'
		case 'unknown-apply-kind':
			return "We don't know how to apply that action."
		case 'list-type-disabled':
			return "That list type isn't enabled on this deployment anymore."
		case 'todo-list-type-locked':
			return "Todo lists can't be converted to or from another type."
		case 'invalid-holiday-selection':
			return 'That holiday selection is invalid. Refresh to see the latest.'
		case 'not-dependent-guardian':
			return "You're not a guardian of that dependent."
		case 'child-cannot-create-gift-ideas':
			return "Children can't create gift-ideas lists."
		case 'no-change':
			return 'Nothing to change — the list is already in the requested shape.'
		case 'merge-cluster-mismatch':
			return 'These lists changed since the suggestion was made. Refresh to see the latest.'
		case 'merge-cross-type-destructive':
			return "These lists can't be safely merged anymore. Refresh to see the latest."
	}
}

function rowToRecommendation(r: IntelligenceRecRow): Recommendation {
	const payload = (r.payload ?? {}) as Partial<Recommendation>
	const fallbackListId = payload.relatedLists?.[0]?.id ?? payload.affected?.listChips?.[0]?.id ?? null
	const actions = payload.actions?.map(a => coerceLegacyAction(a, fallbackListId))
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
		actions,
		dismissDescription: payload.dismissDescription,
		affected: payload.affected,
		relatedLists: payload.relatedLists,
		relatedItems: payload.relatedItems,
		interaction: payload.interaction,
		subItems: payload.subItems,
		bundleNav: payload.bundleNav,
		dismissedSubItemIds: r.dismissedSubItemIds,
	}
}

function buildDependentGroups(byDependent: ReadonlyArray<IntelligenceDependentRecGroup>): Array<DependentRecGroup> {
	return byDependent.map(group => ({
		dependent: group.dependent,
		recs: group.recs.map(rowToRecommendation),
	}))
}

function buildState(data: IntelligencePagePayload, generating: boolean): IntelligencePageState {
	if (!data.enabled) return { kind: 'disabled', reason: 'feature-disabled' }
	if (!data.providerConfigured) return { kind: 'disabled', reason: 'no-provider' }

	const recs: Array<Recommendation> = data.recs.map(rowToRecommendation)

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
