import { createFileRoute } from '@tanstack/react-router'
import { Lock } from 'lucide-react'
import { Suspense } from 'react'

import { isEmailConfigured } from '@/api/common'
import { CreateUserForm } from '@/components/admin/create-user-form'
import SendTestEmailButton from '@/components/admin/send-test-email'
import { UserImpersonation } from '@/components/admin/user-impersonation'
import { AdminUsersList } from '@/components/admin/users-list'
import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientOnly } from '@/components/utilities/client-only'
import { env } from '@/env'
import { useSession } from '@/lib/auth-client'

export const Route = createFileRoute('/(core)/admin/')({
	component: AdminPage,
	loader: async () => {
		return {
			isEmailConfigured: await isEmailConfigured(),
		}
	},
})

function AdminPage() {
	const { isEmailConfigured: isEmailEnabled } = Route.useLoaderData()
	const { data: session } = useSession()

	return (
		<div className="flex flex-col flex-1 w-full max-w-2xl px-2 animate-page-in">
			<div className="flex flex-col flex-1 gap-6">
				{/* HEADING */}
				<div className="relative">
					<h1 className="flex flex-row items-center gap-2 text-red-500">Admin</h1>
					<Lock className="size-22 -left-4 -top-6 text-red-500/30 absolute -z-10" />
				</div>
				{/*  */}
				<Card>
					<CardHeader>
						<CardTitle>Impersonation</CardTitle>
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
				{/*  */}
				<Card>
					<CardHeader>
						<CardTitle>Quick Actions</CardTitle>
					</CardHeader>
					<CardContent>
						<LoadingSkeleton />
					</CardContent>
				</Card>
				{/*  */}
				<Card>
					<CardHeader>
						<CardTitle>Add New User</CardTitle>
					</CardHeader>
					<CardContent>
						<Suspense fallback={<LoadingSkeleton />}>
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
						<Suspense fallback={<LoadingSkeleton />}>
							<AdminUsersList />
						</Suspense>
					</CardContent>
				</Card>
				{/*  */}
				<Card>
					<CardHeader>
						<CardTitle>Emails</CardTitle>
					</CardHeader>
					<CardContent>
						{isEmailEnabled ? (
							<div className="flex flex-col gap-3 max-w-md mx-auto">
								<SendTestEmailButton />
							</div>
						) : (
							<p className="text-sm text-gray-500">Email is not currently configured</p>
						)}
					</CardContent>
				</Card>
				{/*  */}
				<Card>
					<CardHeader>
						<CardTitle>Current Session</CardTitle>
					</CardHeader>
					<CardContent className="divide-y overflow-scroll text-xs">
						<ClientOnly>
							<pre>
								<code>{JSON.stringify(session, null, 2)}</code>
							</pre>
						</ClientOnly>
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
