import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { env } from '@/env'
import { createFileRoute } from '@tanstack/react-router'
import { Lock } from 'lucide-react'
import { Suspense } from 'react'
import { CreateUserForm } from '@/components/admin/create-user-form'

export const Route = createFileRoute('/(core)/admin/')({
	component: RouteComponent,
})

function RouteComponent() {
	return (
		<div className="flex flex-col flex-1 w-full max-w-5xl px-2 animate-page-in">
			<div className="relative flex flex-col flex-1 gap-4">
				{/* HEADING */}
				<h1 className="flex flex-row items-center gap-2 text-red-500">Admin</h1>
				<Lock className="size-18 text-red-500 opacity-30 absolute left-4 -top-4 -z-10" />
				{/* DESCRIPTION */}
				{/*  */}
				{/* CONTENT */}
				<div className="flex flex-col gap-2">
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
				</div>

				<Suspense>
					<Card>
						<CardHeader>
							<CardTitle>Quick Actions</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col gap-4 p-6 pt-0">
							{/* <AdminArchivePurchasedButton /> */}
							{/* <AdminSendTestEmailButton /> */}
						</CardContent>
					</Card>
				</Suspense>

				<Card>
					<CardHeader>
						<CardTitle>Add New User</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<CreateUserForm />
					</CardContent>
				</Card>

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
