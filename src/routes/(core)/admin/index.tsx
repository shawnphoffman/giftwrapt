import { createFileRoute } from '@tanstack/react-router'

import { AppSettingsEditor } from '@/components/admin/app-settings-editor'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientOnly } from '@/components/utilities/client-only'

export const Route = createFileRoute('/(core)/admin/')({
	component: AdminPage,
})

function AdminPage() {
	return (
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
	)
}
