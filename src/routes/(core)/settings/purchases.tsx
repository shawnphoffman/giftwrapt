import { CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(core)/settings/purchases')({
	component: PurchasesPage,
})

function PurchasesPage() {
	return (
		<div className="animate-page-in">
			<CardHeader>
				<CardTitle className="text-2xl">Purchases</CardTitle>
			</CardHeader>
			<CardContent>
				<Skeleton className="h-10 w-full" />
			</CardContent>
		</div>
	)
}
