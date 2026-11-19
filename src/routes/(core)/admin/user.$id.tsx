import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'

import { EditUserForm } from '@/components/admin/edit-user-form'
import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { m } from '@/paraglide/messages.js'
import { pageHead } from '@/routes/-head'

export const Route = createFileRoute('/(core)/admin/user/$id')({
	head: pageHead(() => m.page_edit_user()),
	component: UserDetailsPage,
})

function UserDetailsPage() {
	const { id } = Route.useParams()

	return (
		<Card className="animate-page-in max-w-xl">
			<CardHeader>
				<CardTitle className="text-2xl">{m.admin_users_page_edit_title()}</CardTitle>
			</CardHeader>
			<CardContent>
				<Suspense fallback={<LoadingSkeleton />}>
					<EditUserForm userId={id} />
				</Suspense>
			</CardContent>
		</Card>
	)
}
