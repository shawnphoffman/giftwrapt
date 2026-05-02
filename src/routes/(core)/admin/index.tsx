import { createFileRoute } from '@tanstack/react-router'

import {
	BirthdaySettingsSection,
	ChristmasSettingsSection,
	CommentsSettingsSection,
	CoreSettingsSection,
	TodoSettingsSection,
} from '@/components/admin/app-settings-editor'
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
						<CoreSettingsSection />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in max-w-xl">
				<CardHeader>
					<CardTitle className="text-2xl">Christmas Lists</CardTitle>
					<CardDescription>Christmas-themed lists, automatic post-holiday archiving, and seasonal emails.</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<ChristmasSettingsSection />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in max-w-xl">
				<CardHeader>
					<CardTitle className="text-2xl">Birthday Lists</CardTitle>
					<CardDescription>Birthday lists, automatic archiving after a birthday, and birthday emails.</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<BirthdaySettingsSection />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in max-w-xl">
				<CardHeader>
					<CardTitle className="text-2xl">Todo Lists</CardTitle>
					<CardDescription>Allow users to create todo lists.</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<TodoSettingsSection />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in max-w-xl">
				<CardHeader>
					<CardTitle className="text-2xl">Comments</CardTitle>
					<CardDescription>Item comments and the related email notifications.</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<CommentsSettingsSection />
					</ClientOnly>
				</CardContent>
			</Card>
		</>
	)
}
