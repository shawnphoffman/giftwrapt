import { createFileRoute } from '@tanstack/react-router'

import { StorageMirrorSection } from '@/components/admin/app-settings-editor'
import { StorageBrowser } from '@/components/admin/storage-browser'
import { StorageDisabledBanner } from '@/components/common/storage-disabled-banner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientOnly } from '@/components/utilities/client-only'
import { useStorageStatus } from '@/hooks/use-storage-status'

export const Route = createFileRoute('/(core)/admin/storage')({
	component: AdminStoragePage,
})

function AdminStoragePage() {
	const { configured } = useStorageStatus()

	if (!configured) {
		return (
			<Card className="animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">Storage</CardTitle>
				</CardHeader>
				<CardContent>
					<StorageDisabledBanner />
				</CardContent>
			</Card>
		)
	}

	return (
		<>
			<Card className="animate-page-in max-w-xl">
				<CardHeader>
					<CardTitle className="text-2xl">Storage settings</CardTitle>
					<CardDescription>Behavior that runs whenever items are saved with external image URLs.</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<StorageMirrorSection />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">Storage browser</CardTitle>
					<CardDescription>
						Every object in the configured bucket. Rows are classified as <strong>attached</strong> when a user or item still references
						them, or <strong>orphan</strong> when nothing in the database points at the key. Bulk-delete orphans or remove a single object
						below.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<StorageBrowser />
					</ClientOnly>
				</CardContent>
			</Card>
		</>
	)
}
