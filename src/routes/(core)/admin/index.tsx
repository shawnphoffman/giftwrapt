import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { env } from '@/env'
import { createFileRoute } from '@tanstack/react-router'
import { Lock } from 'lucide-react'
import { Suspense } from 'react'
import { CreateUserForm } from '@/components/admin/create-user-form'
import { ClientOnly } from '@/components/utilities/client-only'
import { Skeleton } from '@/components/ui/skeleton'
import { UsersList } from '@/components/admin/users-list'

export const Route = createFileRoute('/(core)/admin/')({
	component: AdminPage,
})

function AdminPage() {
	return (
		<div className="flex flex-col flex-1 w-full max-w-2xl px-2 animate-page-in">
			<div className="relative flex flex-col flex-1 gap-4">
				<h1 className="flex flex-row items-center gap-2 text-red-500">Admin</h1>
				<Lock className="size-18 text-red-500 opacity-30 absolute left-4 -top-4 -z-10" />
				{/*  */}
				<Card>
					<CardHeader>
						<CardTitle>Impersonation</CardTitle>
					</CardHeader>
					<CardContent>
						<Suspense fallback={<Skeleton className="h-10 w-full" />}>
							<Skeleton className="h-10 w-full" />
							{/* <UserImpersonation /> */}
						</Suspense>
					</CardContent>
				</Card>
				{/*  */}
				<Card>
					<CardHeader>
						<CardTitle>Quick Actions</CardTitle>
					</CardHeader>
					<CardContent>
						<Suspense fallback={<Skeleton className="h-10 w-full" />}>
							<Skeleton className="h-10 w-full" />
							{/* <AdminArchivePurchasedButton /> */}
							{/* <AdminSendTestEmailButton /> */}
						</Suspense>
					</CardContent>
				</Card>
				{/*  */}
				<Card>
					<CardHeader>
						<CardTitle>Add New User</CardTitle>
					</CardHeader>
					<CardContent>
						<Suspense fallback={<Skeleton className="h-10 w-full" />}>
							<ClientOnly>
								<CreateUserForm />
							</ClientOnly>
						</Suspense>
					</CardContent>
				</Card>
				{/*  */}
				<Card>
					<CardHeader>
						<CardTitle>Users</CardTitle>
					</CardHeader>
					<CardContent>
						<Suspense fallback={<Skeleton className="h-10 w-full" />}>
							{/* <ClientOnly> */}
							<UsersList />
							{/* </ClientOnly> */}
						</Suspense>
					</CardContent>
				</Card>
				{/*  */}
				<Card>
					<CardHeader>
						<CardTitle>Environment Variables</CardTitle>
					</CardHeader>
					<CardContent className="divide-y">
						<ClientOnly>
							{Object.entries(env)
								// .filter(entry => !entry[0].startsWith('npm_'))
								.sort((a, b) => a[0].localeCompare(b[0]))
								.map(([key, value]) => (
									<div key={key} className="flex flex-col w-full not-first:pt-1 not-last:pb-1 overflow-hidden">
										<span className="font-mono text-xs font-bold text-gray-500">{key}</span>
										<span className="font-mono text-xs break-all">{String(value)}</span>
									</div>
								))}
						</ClientOnly>
					</CardContent>
				</Card>
			</div>
		</div>
	)
}
