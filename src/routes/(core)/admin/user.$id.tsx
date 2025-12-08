import { createFileRoute } from '@tanstack/react-router'
import { User } from 'lucide-react'
import { Suspense } from 'react'

import { EditUserForm } from '@/components/admin/edit-user-form'
import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/(core)/admin/user/$id')({
	component: UserDetailsPage,
})

function UserDetailsPage() {
	const { id } = Route.useParams()

	return (
		<Card className="bg-accent animate-page-in">
			<CardHeader>
				<CardTitle className="text-2xl">Edit User</CardTitle>
			</CardHeader>
			<CardContent>
				<Suspense fallback={<LoadingSkeleton />}>
					<EditUserForm userId={id} />
				</Suspense>
			</CardContent>
		</Card>
	)
}
