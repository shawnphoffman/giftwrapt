import { ClientOnly, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { Suspense, useState } from 'react'
import { z } from 'zod'

import { CreateDependentForm } from '@/components/admin/create-dependent-form'
import { CreateUserForm } from '@/components/admin/create-user-form'
import { AdminDependentsList } from '@/components/admin/dependents-list'
import { EditUserForm } from '@/components/admin/edit-user-form'
import { PermissionsMatrix } from '@/components/admin/permissions-matrix'
import { UserImpersonation } from '@/components/admin/user-impersonation'
import { AdminUsersList } from '@/components/admin/users-list'
import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const searchSchema = z.object({
	// When set, opens the user-edit dialog over the list. Bookmarkable; the
	// standalone /admin/user/$id page stays available as a direct entry point.
	editUser: z.string().optional(),
})

export const Route = createFileRoute('/(core)/admin/users')({
	component: AdminUsersPage,
	validateSearch: searchSchema,
})

function AdminUsersPage() {
	const search = Route.useSearch()
	const navigate = useNavigate({ from: Route.fullPath })
	const [addUserOpen, setAddUserOpen] = useState(false)
	const [addDependentOpen, setAddDependentOpen] = useState(false)

	const editUserId = search.editUser ?? null
	const closeEditUser = () => navigate({ search: { editUser: undefined }, replace: true })

	return (
		<>
			<Card className="animate-page-in">
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
					<div className="flex items-center justify-between gap-4">
						<CardTitle className="text-2xl">Users</CardTitle>
						<Button onClick={() => setAddUserOpen(true)} size="sm">
							<Plus className="size-4" /> Add user
						</Button>
					</div>
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
					<div className="flex items-center justify-between gap-4">
						<CardTitle className="text-2xl">Dependents</CardTitle>
						<Button onClick={() => setAddDependentOpen(true)} size="sm">
							<Plus className="size-4" /> Add dependent
						</Button>
					</div>
					<CardDescription>
						Non-user gift recipients (pets, babies, anyone managed by another user). Click a row to edit; their guardians manage the lists
						themselves.
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

			<Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
				<DialogContent className="max-w-xl">
					<DialogHeader>
						<DialogTitle>Add user</DialogTitle>
					</DialogHeader>
					<ClientOnly>
						<CreateUserForm onCreated={() => setAddUserOpen(false)} />
					</ClientOnly>
				</DialogContent>
			</Dialog>

			<Dialog open={editUserId !== null} onOpenChange={open => !open && closeEditUser()}>
				<DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Edit user</DialogTitle>
					</DialogHeader>
					<Suspense fallback={<LoadingSkeleton />}>
						<ClientOnly>{editUserId && <EditUserForm userId={editUserId} />}</ClientOnly>
					</Suspense>
				</DialogContent>
			</Dialog>

			<Dialog open={addDependentOpen} onOpenChange={setAddDependentOpen}>
				<DialogContent className="max-w-xl">
					<DialogHeader>
						<DialogTitle>Add dependent</DialogTitle>
						<DialogDescription>
							Pick at least one guardian; they'll see the dependent on /me, /received, and the create-list picker.
						</DialogDescription>
					</DialogHeader>
					<ClientOnly>
						<CreateDependentForm onCreated={() => setAddDependentOpen(false)} />
					</ClientOnly>
				</DialogContent>
			</Dialog>
		</>
	)
}
