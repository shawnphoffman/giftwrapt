import { CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { createFileRoute } from '@tanstack/react-router'

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
				<Skeleton className="h-10 w-full" />
			</CardContent>
		</div>
	)
}
