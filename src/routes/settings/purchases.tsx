import { CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/settings/purchases')({
	component: PurchasesPage,
})

function PurchasesPage() {
	return (
		<div className="animate-page-in">
			<CardHeader>
				<CardTitle className="text-2xl">Purchases</CardTitle>
			</CardHeader>
			<CardContent>
				<LoadingSkeleton />
			</CardContent>
		</div>
	)
}
