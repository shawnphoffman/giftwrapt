import { CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(core)/settings/permissions')({
	component: PermissionsPage,
})

function PermissionsPage() {
	return (
		<div className="animate-page-in">
			<CardHeader>
				<CardTitle className="text-2xl">Permissions</CardTitle>
			</CardHeader>
			<CardContent>
				<Skeleton className="h-10 w-full" />
			</CardContent>
		</div>
	)
}
