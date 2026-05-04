import { createFileRoute } from '@tanstack/react-router'

import { ProviderMissingBanner } from '@/components/intelligence/admin-intelligence-page'
import { IntelligenceAnalyzersCard, IntelligenceFeatureDisabledBanner } from '@/components/intelligence/admin-intelligence-sections'
import { adminIntelligenceQueryOptions, isProviderMissing, useAdminIntelligence } from '@/components/intelligence/use-admin-intelligence'

export const Route = createFileRoute('/(core)/admin_/intelligence/analyzers')({
	loader: ({ context }) => context.queryClient.ensureQueryData(adminIntelligenceQueryOptions),
	component: IntelligenceAnalyzersRoute,
})

function IntelligenceAnalyzersRoute() {
	const { data, patch } = useAdminIntelligence()

	if (!data.settings.enabled) return <IntelligenceFeatureDisabledBanner />
	if (isProviderMissing(data)) return <ProviderMissingBanner />

	return <IntelligenceAnalyzersCard data={data} patch={patch} />
}
