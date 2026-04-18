import { createFileRoute } from '@tanstack/react-router'

import { isEmailConfigured } from '@/api/common'
import { AppSettingsEditor, SchedulingSettingsEditor } from '@/components/admin/app-settings-editor'
import SendTestEmailButton from '@/components/admin/send-test-email'
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
					<CardTitle className="text-2xl">Scheduling</CardTitle>
					<CardDescription>Auto-archive windows and scheduled email toggles.</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<SchedulingSettingsEditor />
					</ClientOnly>
				</CardContent>
			</Card>
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
