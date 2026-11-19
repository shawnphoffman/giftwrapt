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
import { m } from '@/paraglide/messages.js'
import { pageHead } from '@/routes/-head'

const searchSchema = z.object({
	// When set, opens the user-edit dialog over the list. Bookmarkable; the
	// standalone /admin/user/$id page stays available as a direct entry point.
	editUser: z.string().optional(),
})

export const Route = createFileRoute('/(core)/admin/users')({
	head: pageHead(() => m.page_users()),
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
			<Card className="animate-page-in max-w-2xl">
				<CardHeader>
					<CardTitle className="text-2xl">{m.admin_users_page_impersonation_title()}</CardTitle>
					<CardDescription>{m.admin_users_page_impersonation_description()}</CardDescription>
				</CardHeader>
				<CardContent>
					<Suspense fallback={<LoadingSkeleton />}>
						<ClientOnly>
							<UserImpersonation />
						</ClientOnly>
					</Suspense>
				</CardContent>
			</Card>

			<Card className="animate-page-in max-w-2xl">
				<CardHeader>
					<div className="flex items-center justify-between gap-4">
						<CardTitle className="text-2xl">{m.admin_users_page_users_title()}</CardTitle>
						<Button onClick={() => setAddUserOpen(true)} size="sm">
							<Plus className="size-4" /> {m.admin_users_page_add_user()}
						</Button>
					</div>
					<CardDescription>{m.admin_users_page_users_description()}</CardDescription>
				</CardHeader>
				<CardContent>
					<Suspense fallback={<LoadingSkeleton />}>
						<AdminUsersList />
					</Suspense>
				</CardContent>
			</Card>

			<Card className="animate-page-in max-w-2xl">
				<CardHeader>
					<div className="flex items-center justify-between gap-4">
						<CardTitle className="text-2xl">{m.admin_users_page_dependents_title()}</CardTitle>
						<Button onClick={() => setAddDependentOpen(true)} size="sm">
							<Plus className="size-4" />
							{m.action_add()}
						</Button>
					</div>
					<CardDescription>{m.admin_users_page_dependents_description()}</CardDescription>
				</CardHeader>
				<CardContent>
					<Suspense fallback={<LoadingSkeleton />}>
						<AdminDependentsList />
					</Suspense>
				</CardContent>
			</Card>

			<Card className="animate-page-in max-w-2xl">
				<CardHeader>
					<CardTitle className="text-2xl">{m.admin_perms_matrix_title()}</CardTitle>
					<CardDescription>{m.admin_perms_matrix_description()}</CardDescription>
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
						<DialogTitle>{m.admin_users_page_add_user()}</DialogTitle>
					</DialogHeader>
					<ClientOnly>
						<CreateUserForm onCreated={() => setAddUserOpen(false)} />
					</ClientOnly>
				</DialogContent>
			</Dialog>

			<Dialog open={editUserId !== null} onOpenChange={open => !open && closeEditUser()}>
				<DialogContent className="max-w-xl md:max-w-6xl overflow-x-hidden">
					<DialogHeader>
						<DialogTitle>{m.admin_users_page_edit_title()}</DialogTitle>
					</DialogHeader>
					<Suspense fallback={<LoadingSkeleton />}>
						<ClientOnly>{editUserId && <EditUserForm userId={editUserId} onSuccess={closeEditUser} />}</ClientOnly>
					</Suspense>
				</DialogContent>
			</Dialog>

			<Dialog open={addDependentOpen} onOpenChange={setAddDependentOpen}>
				<DialogContent className="max-w-xl">
					<DialogHeader>
						<DialogTitle>{m.admin_users_page_add_dependent_title()}</DialogTitle>
						<DialogDescription>{m.admin_users_page_add_dependent_description()}</DialogDescription>
					</DialogHeader>
					<ClientOnly>
						<CreateDependentForm onCreated={() => setAddDependentOpen(false)} />
					</ClientOnly>
				</DialogContent>
			</Dialog>
		</>
	)
}
