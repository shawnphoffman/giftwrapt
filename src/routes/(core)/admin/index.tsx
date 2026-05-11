import { createFileRoute } from '@tanstack/react-router'

import {
	BirthdaySettingsSection,
	ChristmasSettingsSection,
	CommentsSettingsSection,
	CoreSettingsSection,
	GenericHolidaySettingsSection,
	ParentalRelationsSettingsSection,
	TodoSettingsSection,
} from '@/components/admin/app-settings-editor'
import { HolidayCatalogSection } from '@/components/admin/holiday-catalog-section'
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
					<CardTitle className="text-2xl">Comments</CardTitle>
					<CardDescription>Item comments and the related email notifications.</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<CommentsSettingsSection />
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
					<CardTitle className="text-2xl">Holiday Lists</CardTitle>
					<CardDescription>
						Generic holiday lists (Easter, Mother's Day, Halloween, and more), with auto-archiving after each holiday and an optional email
						summary.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<GenericHolidaySettingsSection />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in max-w-xl">
				<CardHeader>
					<CardTitle className="text-2xl">Holiday Catalog</CardTitle>
					<CardDescription>
						Curate which holidays are available when users create a holiday list. Toggle entries on or off, rename them, or add new ones
						from the bundled library.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<HolidayCatalogSection />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in max-w-xl">
				<CardHeader>
					<CardTitle className="text-2xl">Parental Relations</CardTitle>
					<CardDescription>
						Cross-person flows for Mother's Day and Father's Day. Users tag the mothers and fathers they shop for; reminders and Suggestions
						use those tags.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<ParentalRelationsSettingsSection />
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
		</>
	)
}
