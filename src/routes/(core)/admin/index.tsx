import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { env } from '@/env'
import { createFileRoute } from '@tanstack/react-router'
import { Lock } from 'lucide-react'
import { Suspense } from 'react'
import { CreateUserForm } from '@/components/admin/create-user-form'
import { Skeleton } from '@/components/ui/skeleton'
import { db } from '@/db'
import UserAvatar from '@/components/common/user-avatar'

export const Route = createFileRoute('/(core)/admin/')({
	component: RouteComponent,
	loader: async () => {
		const users = await db.query.user.findMany({
			orderBy: (user, { asc }) => [asc(user.name)],
		})
		return { users }
	},
})

function RouteComponent() {
	return (
		<div className="flex flex-col flex-1 w-full max-w-5xl px-2 animate-page-in">
			<div className="relative flex flex-col flex-1 gap-4">
				{/* HEADING */}
				<h1 className="flex flex-row items-center gap-2 text-red-500">Admin</h1>
				<Lock className="size-18 text-red-500 opacity-30 absolute left-4 -top-4 -z-10" />

				{/*  */}
				<Suspense>
					<Card>
						<CardHeader>
							<CardTitle>Impersonation</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col gap-4 p-6 pt-0">
							{/* <AdminArchivePurchasedButton /> */}
							{/* <AdminSendTestEmailButton /> */}
						</CardContent>
					</Card>
					{/* <UserImpersonation /> */}
				</Suspense>

				{/*  */}
				<Suspense>
					<Card>
						<CardHeader>
							<CardTitle>Quick Actions</CardTitle>
							<CardDescription>Quick actions for the admin.</CardDescription>
						</CardHeader>
						<CardContent>
							<Skeleton className="w-full h-10" />
							{/* <AdminArchivePurchasedButton /> */}
							{/* <AdminSendTestEmailButton /> */}
						</CardContent>
					</Card>
				</Suspense>

				{/*  */}
				<Card>
					<CardHeader>
						<CardTitle>Add New User</CardTitle>
						<CardDescription>Use this form to add a new basic user.</CardDescription>
					</CardHeader>
					<CardContent>
						<CreateUserForm />
					</CardContent>
				</Card>

				{/*  */}
				<Card>
					<CardHeader>
						<CardTitle>Users</CardTitle>
						<CardDescription>List of all users.</CardDescription>
					</CardHeader>
					<CardContent>
						<Suspense fallback={<Skeleton className="w-full h-10" />}>
							<UsersList />
						</Suspense>
					</CardContent>
				</Card>

				{/*  */}
				<Suspense>
					<Card>
						<CardHeader>
							<CardTitle>Env</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col divide-y">
							{Object.entries(env)
								// .filter(entry => !entry[0].startsWith('npm_'))
								.sort((a, b) => a[0].localeCompare(b[0]))
								.map(([key, value]) => (
									<div key={key} className="flex flex-col w-full not-first:pt-1 not-last:pb-1 overflow-hidden">
										<span className="font-mono text-xs font-bold text-gray-500">{key}</span>
										<span className="font-mono text-xs break-all">{String(value)}</span>
									</div>
								))}
						</CardContent>
					</Card>
				</Suspense>
			</div>
		</div>
	)
}

function UsersList() {
	const { users } = Route.useLoaderData()

	return (
		<div className="flex flex-col gap-2">
			{users.length === 0 ? (
				<p className="text-sm text-muted-foreground">No users found.</p>
			) : (
				users.map(user => (
					<div key={user.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors">
						{user.image && <img src={user.image || ''} alt={''} className="w-10 h-10 rounded-full" />}
						<UserAvatar name={user.name || user.email} image={user.image} />
						<div className="flex flex-col flex-1 min-w-0">
							<span className="font-medium truncate">{user.name || user.email}</span>
							{user.name && <span className="text-sm text-muted-foreground truncate">{user.email}</span>}
						</div>
						<div className="shrink-0">
							<span className="text-sm font-medium text-muted-foreground">{user.role || 'user'}</span>
						</div>
					</div>
				))
			)}
		</div>
	)
}
