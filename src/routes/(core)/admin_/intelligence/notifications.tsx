import { createFileRoute } from '@tanstack/react-router'

import { ProviderMissingBanner } from '@/components/intelligence/admin-intelligence-page'
import { IntelligenceFeatureDisabledBanner, IntelligenceNotificationsCard } from '@/components/intelligence/admin-intelligence-sections'
import { adminIntelligenceQueryOptions, isProviderMissing, useAdminIntelligence } from '@/components/intelligence/use-admin-intelligence'

export const Route = createFileRoute('/(core)/admin_/intelligence/notifications')({
	loader: ({ context }) => context.queryClient.ensureQueryData(adminIntelligenceQueryOptions),
	component: IntelligenceNotificationsRoute,
})

function IntelligenceNotificationsRoute() {
	const { data, patch } = useAdminIntelligence()

	if (!data.settings.enabled) return <IntelligenceFeatureDisabledBanner />
	if (isProviderMissing(data)) return <ProviderMissingBanner />

	return <IntelligenceNotificationsCard data={data} patch={patch} />
}
