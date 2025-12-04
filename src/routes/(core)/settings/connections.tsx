import { createFileRoute } from '@tanstack/react-router'

import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/(core)/settings/connections')({
	component: ConnectionsPage,
})

function ConnectionsPage() {
	return (
		<div className="animate-page-in">
			<CardHeader>
				<CardTitle className="text-2xl">Connections</CardTitle>
			</CardHeader>
			<CardContent>
				<LoadingSkeleton />
			</CardContent>
		</div>
	)
}
