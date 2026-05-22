import { createFileRoute } from '@tanstack/react-router'

import { ActionsCard, HealthGrid } from '@/components/intelligence/admin-intelligence-page'
import { ProviderMissingBanner } from '@/components/intelligence/admin-intelligence-page'
import { IntelligenceFeatureDisabledBanner } from '@/components/intelligence/admin-intelligence-sections'
import {
	adminIntelligenceQueryOptions,
	adminUserRunSummariesQueryOptions,
	isProviderMissing,
	providerSummaryFor,
	useAdminIntelligence,
	useAdminUserRunSummaries,
} from '@/components/intelligence/use-admin-intelligence'

export const Route = createFileRoute('/(core)/admin_/intelligence/')({
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(adminIntelligenceQueryOptions),
			context.queryClient.ensureQueryData(adminUserRunSummariesQueryOptions),
		]),
	component: IntelligenceStatsRoute,
})

function IntelligenceStatsRoute() {
	const { data, runForUser, localPendingUserIds } = useAdminIntelligence()
	const { summaries, serverRunningUserIds } = useAdminUserRunSummaries()
	const providerMissing = isProviderMissing(data)

	// Union of local in-flight clicks and server-reported running rows so a
	// click shows a spinner immediately AND runs started elsewhere (cron,
	// other admin tab) also surface here.
	const runningUserIds = new Set<string>([...localPendingUserIds, ...serverRunningUserIds])

	if (!data.settings.enabled) {
		return <IntelligenceFeatureDisabledBanner />
	}

	if (providerMissing) {
		return <ProviderMissingBanner />
	}

	return (
		<>
			<HealthGrid data={data} providerSummary={providerSummaryFor(data)} />
			<ActionsCard summaries={summaries} onRunForUser={runForUser} runningUserIds={runningUserIds} />
		</>
	)
}
