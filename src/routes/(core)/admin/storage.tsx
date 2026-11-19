import { createFileRoute } from '@tanstack/react-router'

import { StorageMirrorSection } from '@/components/admin/app-settings-editor'
import { StorageBrowser } from '@/components/admin/storage-browser'
import { RichMessage } from '@/components/common/rich-message'
import { StorageDisabledBanner } from '@/components/common/storage-disabled-banner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientOnly } from '@/components/utilities/client-only'
import { useStorageStatus } from '@/hooks/use-storage-status'
import { m } from '@/paraglide/messages.js'
import { pageHead } from '@/routes/-head'

export const Route = createFileRoute('/(core)/admin/storage')({
	head: pageHead(() => m.page_storage()),
	component: AdminStoragePage,
})

function AdminStoragePage() {
	const { configured } = useStorageStatus()

	if (!configured) {
		return (
			<Card className="animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">{m.admin_nav_storage_title()}</CardTitle>
				</CardHeader>
				<CardContent>
					<StorageDisabledBanner />
				</CardContent>
			</Card>
		)
	}

	return (
		<>
			<Card className="animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">{m.admin_nav_storage_settings_title()}</CardTitle>
					<CardDescription>{m.admin_nav_storage_settings_description()}</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<StorageMirrorSection />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in">
				<CardHeader>
					<CardTitle className="text-2xl">{m.admin_nav_storage_browser_title()}</CardTitle>
					<CardDescription>
						<RichMessage parts={m.admin_nav_storage_browser_description.parts()} tags={{ strong: c => <strong>{c}</strong> }} />
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
