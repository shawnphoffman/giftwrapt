import { createFileRoute } from '@tanstack/react-router'

import { ProviderMissingBanner } from '@/components/intelligence/admin-intelligence-page'
import { IntelligenceFeatureDisabledBanner, IntelligenceSchedulingCard } from '@/components/intelligence/admin-intelligence-sections'
import { adminIntelligenceQueryOptions, isProviderMissing, useAdminIntelligence } from '@/components/intelligence/use-admin-intelligence'
import { m } from '@/paraglide/messages.js'
import { pageHead } from '@/routes/-head'

export const Route = createFileRoute('/(core)/admin_/intelligence/scheduling')({
	head: pageHead(() => m.page_intelligence_scheduling()),
	loader: ({ context }) => context.queryClient.ensureQueryData(adminIntelligenceQueryOptions),
	component: IntelligenceSchedulingRoute,
})

function IntelligenceSchedulingRoute() {
	const { data, patch } = useAdminIntelligence()

	if (!data.settings.enabled) return <IntelligenceFeatureDisabledBanner />
	if (isProviderMissing(data)) return <ProviderMissingBanner />

	return <IntelligenceSchedulingCard data={data} patch={patch} />
}
