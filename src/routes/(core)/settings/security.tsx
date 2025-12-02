import { CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(core)/settings/security')({
	component: SecurityPage,
})

function SecurityPage() {
	return (
		<div className="animate-page-in">
			<CardHeader>
				<CardTitle className="text-2xl">Security</CardTitle>
			</CardHeader>
			<CardContent>
				<Skeleton className="h-10 w-full" />
			</CardContent>
		</div>
	)
}
