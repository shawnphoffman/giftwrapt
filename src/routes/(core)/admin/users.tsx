import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'

import { CreateUserForm } from '@/components/admin/create-user-form'
import { AdminUsersList } from '@/components/admin/users-list'
import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/(core)/admin/users')({
	component: AdminUsersPage,
})

function AdminUsersPage() {
	return (
		<>
			<Card className="bg-accent animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">Users</CardTitle>
					<CardDescription>Manage users and their permissions.</CardDescription>
				</CardHeader>
				<CardContent>
					<Suspense fallback={<LoadingSkeleton />}>
						<AdminUsersList />
					</Suspense>
				</CardContent>
			</Card>
			<Card className="bg-accent animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">Add User</CardTitle>
				</CardHeader>
				<CardContent>
					<Suspense fallback={<LoadingSkeleton />}>
						<ClientOnly>
							<CreateUserForm />
						</ClientOnly>
					</Suspense>
				</CardContent>
			</Card>
		</>
	)
}
