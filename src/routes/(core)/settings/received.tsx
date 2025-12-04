import { createFileRoute } from '@tanstack/react-router'

import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/(core)/settings/received')({
	component: ReceivedPage,
})

function ReceivedPage() {
	return (
		<div className="animate-page-in">
			<CardHeader>
				<CardTitle className="text-2xl">Received Gifts</CardTitle>
			</CardHeader>
			<CardContent>
				<LoadingSkeleton />
			</CardContent>
		</div>
	)
}
