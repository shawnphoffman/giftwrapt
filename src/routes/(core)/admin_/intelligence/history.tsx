import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

import { getAdminRunDetail } from '@/api/admin-intelligence'
import { ProviderMissingBanner, RunsTable } from '@/components/intelligence/admin-intelligence-page'
import { IntelligenceFeatureDisabledBanner } from '@/components/intelligence/admin-intelligence-sections'
import { RunDebugPanel } from '@/components/intelligence/run-debug-panel'
import { adminIntelligenceQueryOptions, isProviderMissing, useAdminIntelligence } from '@/components/intelligence/use-admin-intelligence'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

export const Route = createFileRoute('/(core)/admin_/intelligence/history')({
	loader: ({ context }) => context.queryClient.ensureQueryData(adminIntelligenceQueryOptions),
	component: IntelligenceHistoryRoute,
})

function IntelligenceHistoryRoute() {
	const { data, runForUser, invalidateHash, purgeRecs } = useAdminIntelligence()
	const [filter, setFilter] = useState<'all' | 'success' | 'skipped' | 'error'>('all')
	const [openRunId, setOpenRunId] = useState<string | null>(null)

	const runDetailQuery = useQuery({
		queryKey: ['admin', 'intelligence', 'run', openRunId] as const,
		queryFn: () => getAdminRunDetail({ data: { runId: openRunId! } }),
		enabled: openRunId !== null,
		staleTime: 30_000,
	})

	if (!data.settings.enabled) return <IntelligenceFeatureDisabledBanner />
	if (isProviderMissing(data)) return <ProviderMissingBanner />

	const filteredRuns = data.runs.filter(r => filter === 'all' || r.status === filter)

	const debugState = !openRunId
		? { kind: 'loading' as const }
		: runDetailQuery.isLoading || runDetailQuery.isFetching
			? { kind: 'loading' as const }
			: runDetailQuery.error
				? {
						kind: 'error' as const,
						message: runDetailQuery.error instanceof Error ? runDetailQuery.error.message : 'Unknown error',
					}
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
			<RunsTable
				runs={filteredRuns}
				filter={filter}
				setFilter={setFilter}
				onOpenRun={runId => setOpenRunId(runId)}
				onRunForUser={runForUser}
				onInvalidateHash={invalidateHash}
				onPurgeRecs={purgeRecs}
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
