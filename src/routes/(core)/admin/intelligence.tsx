import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import {
	adminInvalidateInputHash,
	adminPurgeRecsForUser,
	adminRunForMe,
	adminRunForUser,
	getAdminIntelligenceData,
	getAdminRunDetail,
} from '@/api/admin-intelligence'
import { updateAppSettings } from '@/api/settings'
import type { AdminIntelligenceData } from '@/components/intelligence/__fixtures__/types'
import { AdminIntelligencePageContent } from '@/components/intelligence/admin-intelligence-page'
import { RunDebugPanel } from '@/components/intelligence/run-debug-panel'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

const adminIntelligenceQueryOptions = {
	queryKey: ['admin', 'intelligence'] as const,
	queryFn: () => getAdminIntelligenceData(),
	staleTime: 30_000,
}

export const Route = createFileRoute('/(core)/admin/intelligence')({
	loader: ({ context }) => context.queryClient.ensureQueryData(adminIntelligenceQueryOptions),
	component: AdminIntelligenceRoute,
})

function AdminIntelligenceRoute() {
	const { data } = useSuspenseQuery(adminIntelligenceQueryOptions)
	const queryClient = useQueryClient()
	const invalidate = () => queryClient.invalidateQueries({ queryKey: adminIntelligenceQueryOptions.queryKey })

	const [openRunId, setOpenRunId] = useState<string | null>(null)
	const runDetailQuery = useQuery({
		queryKey: ['admin', 'intelligence', 'run', openRunId] as const,
		queryFn: () => getAdminRunDetail({ data: { runId: openRunId! } }),
		enabled: openRunId !== null,
		staleTime: 30_000,
	})

	const settingsMutation = useMutation({
		mutationFn: (changes: Partial<AdminIntelligenceData['settings']>) => {
			// Map the typed admin-fixture settings shape onto the flat
			// intelligence* keys in appSettingsSchema. Only forward changed
			// keys so unrelated rows aren't touched.
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

	const runForMeMutation = useMutation({
		mutationFn: () => adminRunForMe(),
		onSuccess: invalidate,
	})
	const runForUserMutation = useMutation({
		mutationFn: (userId: string) => adminRunForUser({ data: { userId } }),
		onSuccess: invalidate,
	})
	const invalidateHashMutation = useMutation({
		mutationFn: (userId: string) => adminInvalidateInputHash({ data: { userId } }),
		onSuccess: invalidate,
	})
	const purgeMutation = useMutation({
		mutationFn: (userId: string) => adminPurgeRecsForUser({ data: { userId } }),
		onSuccess: invalidate,
	})

	const adapted = useMemo<AdminIntelligenceData>(() => adaptAdminData(data), [data])

	const debugState = !openRunId
		? { kind: 'loading' as const }
		: runDetailQuery.isLoading || runDetailQuery.isFetching
			? { kind: 'loading' as const }
			: runDetailQuery.error
				? { kind: 'error' as const, message: runDetailQuery.error instanceof Error ? runDetailQuery.error.message : 'Unknown error' }
				: runDetailQuery.data
					? {
							kind: 'loaded' as const,
							data: {
								run: {
									...runDetailQuery.data.run,
									startedAt: new Date(runDetailQuery.data.run.startedAt),
									finishedAt: runDetailQuery.data.run.finishedAt ? new Date(runDetailQuery.data.run.finishedAt) : null,
								},
								steps: runDetailQuery.data.steps,
								recs: runDetailQuery.data.recs.map(r => ({
									...r,
									createdAt: new Date(r.createdAt),
									dismissedAt: r.dismissedAt ? new Date(r.dismissedAt) : null,
								})),
							},
						}
					: { kind: 'loading' as const }

	return (
		<>
			<AdminIntelligencePageContent
				data={adapted}
				onSettingsChange={changes => settingsMutation.mutate(changes)}
				onRunForMe={() => runForMeMutation.mutate()}
				onRunForUser={userId => runForUserMutation.mutate(userId)}
				onInvalidateHash={userId => invalidateHashMutation.mutate(userId)}
				onPurgeRecs={userId => purgeMutation.mutate(userId)}
				onOpenRun={runId => setOpenRunId(runId)}
			/>
			<Sheet open={openRunId !== null} onOpenChange={open => !open && setOpenRunId(null)}>
				<SheetContent
					data-intelligence="admin-run-debug-sheet"
					side="right"
					className="w-full sm:max-w-2xl data-[side=right]:sm:max-w-2xl flex flex-col gap-0 p-0"
				>
					<SheetHeader className="border-b border-border">
						<SheetTitle>Run debug</SheetTitle>
						<SheetDescription className="font-mono text-[11px] truncate">{openRunId ?? ''}</SheetDescription>
					</SheetHeader>
					<RunDebugPanel state={debugState} />
				</SheetContent>
			</Sheet>
		</>
	)
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
		})),
		dailySeries: raw.dailySeries,
	}
}
