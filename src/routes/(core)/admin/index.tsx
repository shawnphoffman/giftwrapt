import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'

import { isEmailConfigured } from '@/api/common'
import { AppSettingsEditor } from '@/components/admin/app-settings-editor'
import SendTestEmailButton from '@/components/admin/send-test-email'
import { UserImpersonation } from '@/components/admin/user-impersonation'
import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientOnly } from '@/components/utilities/client-only'

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

	return (
		<>
			<Card className="bg-accent animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">App Settings</CardTitle>
					<CardDescription>Configure global application settings.</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<AppSettingsEditor />
					</ClientOnly>
				</CardContent>
			</Card>
			{/*  */}
			<Card className="bg-accent animate-page-in">
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
			{/*  */}
			<Card className="bg-accent animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">Quick Actions</CardTitle>
				</CardHeader>
				<CardContent>
					<LoadingSkeleton />
				</CardContent>
			</Card>
			{/*  */}
			{/*  */}
			<Card className="bg-accent animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">Emails</CardTitle>
					<CardDescription>
						Test emails will be sent to the configured BCC address or the FROM address if no BCC address is configured.
					</CardDescription>
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
		</>
	)
}
