import { createFileRoute } from '@tanstack/react-router'

import { ActionsCard, HealthGrid } from '@/components/intelligence/admin-intelligence-page'
import { ProviderMissingBanner } from '@/components/intelligence/admin-intelligence-page'
import { IntelligenceFeatureDisabledBanner } from '@/components/intelligence/admin-intelligence-sections'
import {
	adminIntelligenceQueryOptions,
	isProviderMissing,
	providerSummaryFor,
	useAdminIntelligence,
} from '@/components/intelligence/use-admin-intelligence'

export const Route = createFileRoute('/(core)/admin_/intelligence/')({
	loader: ({ context }) => context.queryClient.ensureQueryData(adminIntelligenceQueryOptions),
	component: IntelligenceStatsRoute,
})

function IntelligenceStatsRoute() {
	const { data, runForMe, runForMePending } = useAdminIntelligence()
	const providerMissing = isProviderMissing(data)

	if (!data.settings.enabled) {
		return <IntelligenceFeatureDisabledBanner />
	}

	if (providerMissing) {
		return <ProviderMissingBanner />
	}

	return (
		<>
			<HealthGrid data={data} providerSummary={providerSummaryFor(data)} />
			<ActionsCard onRunForMe={runForMe} runForMePending={runForMePending} />
		</>
	)
}
