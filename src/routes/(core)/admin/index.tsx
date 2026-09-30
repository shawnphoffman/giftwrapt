import { createFileRoute } from '@tanstack/react-router'

import {
	BirthdaySettingsSection,
	ChristmasSettingsSection,
	CommentsSettingsSection,
	CoreSettingsSection,
	GenericHolidaySettingsSection,
	ObservabilitySettingsSection,
	ParentalRelationsSettingsSection,
	TodoSettingsSection,
} from '@/components/admin/app-settings-editor'
import { CustomHolidaysSection } from '@/components/admin/custom-holidays-section'
import { StorageDisabledBanner } from '@/components/common/storage-disabled-banner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientOnly } from '@/components/utilities/client-only'

export const Route = createFileRoute('/(core)/admin/')({
	component: AdminPage,
})

function AdminPage() {
	return (
		<>
			<StorageDisabledBanner />
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
				<CardContent className="space-y-6">
					<ClientOnly>
						<GenericHolidaySettingsSection />
					</ClientOnly>
					<div className="space-y-3 border-t border-border pt-6">
						<div className="space-y-0.5">
							<h3 className="text-base font-medium">Available Holidays</h3>
							<p className="text-sm text-muted-foreground">
								The holidays users can pick from when creating a holiday list. Add one from the built-in gift-giving catalog or create your
								own. Deleting a holiday that's in use switches its lists to the default list type and keeps their claims.
							</p>
						</div>
						<ClientOnly>
							<CustomHolidaysSection />
						</ClientOnly>
					</div>
				</CardContent>
			</Card>
			<Card className="animate-page-in max-w-xl">
				<CardHeader>
					<CardTitle className="text-2xl">Relationship Reminders</CardTitle>
					<CardDescription>
						Reminders for Mother's Day, Father's Day, Valentine's Day, and partner anniversaries. Each one has its own on/off switch, lead
						time, and email setting. Turning one off also hides its related profile field (parent labels or anniversary date).
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
			<Card className="animate-page-in max-w-xl">
				<CardHeader>
					<CardTitle className="text-2xl">Observability</CardTitle>
					<CardDescription>
						Optional error reporting and metrics, off by default. Each one needs its environment variable (DSN or token) set and its toggle
						turned on. Data only goes to the backends you configure.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<ObservabilitySettingsSection />
					</ClientOnly>
				</CardContent>
			</Card>
		</>
	)
}
