import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'

import { CreateDependentForm } from '@/components/admin/create-dependent-form'
import { CreateUserForm } from '@/components/admin/create-user-form'
import { AdminDependentsList } from '@/components/admin/dependents-list'
import { PermissionsMatrix } from '@/components/admin/permissions-matrix'
import { UserImpersonation } from '@/components/admin/user-impersonation'
import { AdminUsersList } from '@/components/admin/users-list'
import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/(core)/admin/users')({
	component: AdminUsersPage,
})

function AdminUsersPage() {
	return (
		<>
			<Card className="animate-page-in max-w-xl">
				<CardHeader>
					<CardTitle className="text-2xl">Impersonation</CardTitle>
					<CardDescription>Impersonate a user to see the app as they do.</CardDescription>
				</CardHeader>
				<CardContent>
					<Suspense fallback={<LoadingSkeleton />}>
						<ClientOnly>
							<UserImpersonation />
						</ClientOnly>
					</Suspense>
				</CardContent>
			</Card>
			<Card className="animate-page-in">
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
			<Card className="animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">Dependents</CardTitle>
					<CardDescription>
						Non-user gift recipients (pets, babies, anyone managed by another user). Their guardians manage the lists; here you can rename,
						change guardians, and delete.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Suspense fallback={<LoadingSkeleton />}>
						<AdminDependentsList />
					</Suspense>
				</CardContent>
			</Card>
			<Card className="animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">Permissions Matrix</CardTitle>
					<CardDescription>
						Who can view or edit whose lists. Read each row as: this viewer's access to the column owner's lists. Dependents appear as
						columns only (they're always recipients, never viewers).
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Suspense fallback={<LoadingSkeleton />}>
						<ClientOnly>
							<PermissionsMatrix />
						</ClientOnly>
					</Suspense>
				</CardContent>
			</Card>
			<Card className="animate-page-in max-w-xl">
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
			<Card className="animate-page-in max-w-xl">
				<CardHeader>
					<CardTitle className="text-2xl">Add Dependent</CardTitle>
					<CardDescription>
						Pick at least one guardian; they'll see the dependent on /me, /received, and the create-list picker.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Suspense fallback={<LoadingSkeleton />}>
						<ClientOnly>
							<CreateDependentForm />
						</ClientOnly>
					</Suspense>
				</CardContent>
			</Card>
		</>
	)
}
