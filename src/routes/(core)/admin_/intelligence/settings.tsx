import { createFileRoute } from '@tanstack/react-router'

import { ProviderMissingBanner } from '@/components/intelligence/admin-intelligence-page'
import { IntelligenceFeatureDisabledBanner, IntelligenceGeneralSettingsCard } from '@/components/intelligence/admin-intelligence-sections'
import { adminIntelligenceQueryOptions, isProviderMissing, useAdminIntelligence } from '@/components/intelligence/use-admin-intelligence'
import { m } from '@/paraglide/messages.js'
import { pageHead } from '@/routes/-head'

export const Route = createFileRoute('/(core)/admin_/intelligence/settings')({
	head: pageHead(() => m.page_intelligence_settings()),
	loader: ({ context }) => context.queryClient.ensureQueryData(adminIntelligenceQueryOptions),
	component: IntelligenceSettingsRoute,
})

function IntelligenceSettingsRoute() {
	const { data, patch } = useAdminIntelligence()

	if (!data.settings.enabled) return <IntelligenceFeatureDisabledBanner />
	if (isProviderMissing(data)) return <ProviderMissingBanner />

	return <IntelligenceGeneralSettingsCard data={data} patch={patch} />
}
