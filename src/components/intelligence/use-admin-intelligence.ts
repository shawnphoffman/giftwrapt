import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { toast } from 'sonner'

import {
	adminInvalidateInputHash,
	adminPurgeRecsForUser,
	adminRunForMe,
	adminRunForUser,
	type AdminUserRunSummary,
	getAdminIntelligenceData,
	getAdminUserRunSummaries,
} from '@/api/admin-intelligence'
import { updateAppSettings } from '@/api/settings'

import type { AdminIntelligenceData } from './__fixtures__/types'

export const adminIntelligenceQueryOptions = {
	queryKey: ['admin', 'intelligence'] as const,
	queryFn: () => getAdminIntelligenceData(),
	staleTime: 30_000,
}

export const adminUserRunSummariesQueryOptions = {
	queryKey: ['admin', 'intelligence', 'user-summaries'] as const,
	queryFn: () => getAdminUserRunSummaries(),
	staleTime: 30_000,
}

export type AdminUserRunSummaryView = Omit<AdminUserRunSummary, 'lastRunAt'> & { lastRunAt: Date | null }

export function useAdminIntelligence() {
	const { data: raw } = useSuspenseQuery(adminIntelligenceQueryOptions)
	const queryClient = useQueryClient()
	const invalidate = () => queryClient.invalidateQueries({ queryKey: adminIntelligenceQueryOptions.queryKey })

	const settingsMutation = useMutation({
		mutationFn: (changes: Partial<AdminIntelligenceData['settings']>) => {
			const payload: Record<string, unknown> = {}
			if (changes.enabled !== undefined) payload.intelligenceEnabled = changes.enabled
			if (changes.refreshIntervalDays !== undefined) payload.intelligenceRefreshIntervalDays = changes.refreshIntervalDays
			if (changes.manualRefreshCooldownMinutes !== undefined)
				payload.intelligenceManualRefreshCooldownMinutes = changes.manualRefreshCooldownMinutes
			if (changes.candidateCap !== undefined) payload.intelligenceCandidateCap = changes.candidateCap
			if (changes.concurrency !== undefined) payload.intelligenceConcurrency = changes.concurrency
			if (changes.usersPerInvocation !== undefined) payload.intelligenceUsersPerInvocation = changes.usersPerInvocation
			if (changes.staleRecRetentionDays !== undefined) payload.intelligenceStaleRecRetentionDays = changes.staleRecRetentionDays
			if (changes.runStepsRetentionDays !== undefined) payload.intelligenceRunStepsRetentionDays = changes.runStepsRetentionDays
			if (changes.dryRun !== undefined) payload.intelligenceDryRun = changes.dryRun
			if (changes.modelOverride !== undefined) payload.intelligenceModelOverride = changes.modelOverride
			if (changes.perAnalyzerEnabled !== undefined) payload.intelligencePerAnalyzerEnabled = changes.perAnalyzerEnabled
			if (changes.email) {
				payload.intelligenceEmailEnabled = changes.email.enabled
				payload.intelligenceEmailWeeklyDigestEnabled = changes.email.weeklyDigestEnabled
				payload.intelligenceEmailTestRecipient = changes.email.testRecipient ?? null
			}
			return updateAppSettings({ data: payload as Parameters<typeof updateAppSettings>[0]['data'] })
		},
		onSuccess: invalidate,
		onError: e => toast.error(e instanceof Error ? e.message : 'Settings update failed'),
	})

	const invalidateAll = () => {
		queryClient.invalidateQueries({ queryKey: adminIntelligenceQueryOptions.queryKey })
		queryClient.invalidateQueries({ queryKey: adminUserRunSummariesQueryOptions.queryKey })
	}

	const runForMeMutation = useMutation({
		mutationFn: () => adminRunForMe(),
		onSuccess: invalidateAll,
	})
	const runForUserMutation = useMutation({
		mutationFn: (userId: string) => adminRunForUser({ data: { userId } }),
		onSuccess: invalidateAll,
	})
	const invalidateHashMutation = useMutation({
		mutationFn: (userId: string) => adminInvalidateInputHash({ data: { userId } }),
		onSuccess: invalidate,
	})
	const purgeMutation = useMutation({
		mutationFn: (userId: string) => adminPurgeRecsForUser({ data: { userId } }),
		onSuccess: invalidate,
	})

	const data = useMemo<AdminIntelligenceData>(() => adaptAdminData(raw), [raw])

	return {
		data,
		patch: (changes: Partial<AdminIntelligenceData['settings']>) => settingsMutation.mutate(changes),
		runForMe: () => runForMeMutation.mutate(),
		runForUser: (userId: string) => runForUserMutation.mutate(userId),
		invalidateHash: (userId: string) => invalidateHashMutation.mutate(userId),
		purgeRecs: (userId: string) => purgeMutation.mutate(userId),
		runForMePending: runForMeMutation.isPending,
		runForUserPendingId: runForUserMutation.isPending ? runForUserMutation.variables : null,
	}
}

export function useAdminUserRunSummaries(): { summaries: Array<AdminUserRunSummaryView> } {
	const { data } = useSuspenseQuery(adminUserRunSummariesQueryOptions)
	const summaries = useMemo<Array<AdminUserRunSummaryView>>(
		() => data.map(s => ({ ...s, lastRunAt: s.lastRunAt ? new Date(s.lastRunAt) : null })),
		[data]
	)
	return { summaries }
}

function adaptAdminData(raw: Awaited<ReturnType<typeof getAdminIntelligenceData>>): AdminIntelligenceData {
	return {
		settings: raw.settings,
		health: {
			totalActiveRecs: raw.health.totalActiveRecs,
			analyzers: raw.health.analyzers as AdminIntelligenceData['health']['analyzers'],
			last24h: raw.health.last24h,
			last7d: raw.health.last7d,
			dailyTokensIn: raw.health.dailyTokensIn,
			dailyTokensOut: raw.health.dailyTokensOut,
			dailyEstimatedCostUsd: raw.health.dailyEstimatedCostUsd,
			queue: raw.health.queue,
			provider: raw.health.provider,
		},
		runs: raw.runs.map(r => ({
			id: r.id,
			userId: r.userId,
			userName: r.userName,
			userImage: r.userImage,
			startedAt: new Date(r.startedAt),
			finishedAt: r.finishedAt ? new Date(r.finishedAt) : null,
			status: r.status,
			trigger: r.trigger,
			skipReason: r.skipReason,
			error: r.error,
			tokensIn: r.tokensIn,
			tokensOut: r.tokensOut,
			estimatedCostUsd: r.estimatedCostUsd,
			durationMs: r.durationMs,
			inputHashShort: r.inputHashShort,
			recCounts: r.recCounts as AdminIntelligenceData['runs'][number]['recCounts'],
			stepCounts: r.stepCounts,
		})),
		dailySeries: raw.dailySeries,
	}
}

export function providerSummaryFor(data: AdminIntelligenceData): string {
	if (data.health.provider.source === 'none') return 'No provider configured'
	return `${data.health.provider.provider ?? '?'} / ${data.health.provider.model ?? '?'} (${data.health.provider.source})`
}

export function isProviderMissing(data: AdminIntelligenceData): boolean {
	return data.health.provider.source === 'none'
}
