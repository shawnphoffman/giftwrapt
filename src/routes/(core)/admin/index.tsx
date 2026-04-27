import { createFileRoute } from '@tanstack/react-router'

import { AppSettingsEditor } from '@/components/admin/app-settings-editor'
import { StorageDisabledBanner } from '@/components/common/storage-disabled-banner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientOnly } from '@/components/utilities/client-only'

export const Route = createFileRoute('/(core)/admin/')({
	component: AdminPage,
})

function AdminPage() {
	return (
		<>
			<div className="max-w-xl">
				<StorageDisabledBanner />
			</div>
			<Card className="animate-page-in max-w-xl">
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
		</>
	)
}
