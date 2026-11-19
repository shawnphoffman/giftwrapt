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
import { m } from '@/paraglide/messages.js'

export const Route = createFileRoute('/(core)/admin/')({
	component: AdminPage,
})

function AdminPage() {
	return (
		<>
			<StorageDisabledBanner />
			<Card className="animate-page-in max-w-xl">
				<CardHeader>
					<CardTitle className="text-2xl">{m.admin_nav_general_settings_title()}</CardTitle>
					<CardDescription>{m.admin_nav_general_settings_description()}</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<CoreSettingsSection />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in max-w-xl">
				<CardHeader>
					<CardTitle className="text-2xl">{m.admin_nav_general_comments_title()}</CardTitle>
					<CardDescription>{m.admin_nav_general_comments_description()}</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<CommentsSettingsSection />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in max-w-xl">
				<CardHeader>
					<CardTitle className="text-2xl">{m.admin_nav_general_birthday_title()}</CardTitle>
					<CardDescription>{m.admin_nav_general_birthday_description()}</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<BirthdaySettingsSection />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in max-w-xl">
				<CardHeader>
					<CardTitle className="text-2xl">{m.admin_nav_general_christmas_title()}</CardTitle>
					<CardDescription>{m.admin_nav_general_christmas_description()}</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<ChristmasSettingsSection />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in max-w-xl">
				<CardHeader>
					<CardTitle className="text-2xl">{m.admin_nav_general_holiday_title()}</CardTitle>
					<CardDescription>{m.admin_nav_general_holiday_description()}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					<ClientOnly>
						<GenericHolidaySettingsSection />
					</ClientOnly>
					<div className="space-y-3 border-t border-border pt-6">
						<div className="space-y-0.5">
							<h3 className="text-base font-medium">{m.admin_nav_general_holidays_available_title()}</h3>
							<p className="text-sm text-muted-foreground">{m.admin_nav_general_holidays_available_description()}</p>
						</div>
						<ClientOnly>
							<CustomHolidaysSection />
						</ClientOnly>
					</div>
				</CardContent>
			</Card>
			<Card className="animate-page-in max-w-xl">
				<CardHeader>
					<CardTitle className="text-2xl">{m.admin_nav_general_reminders_title()}</CardTitle>
					<CardDescription>{m.admin_nav_general_reminders_description()}</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<ParentalRelationsSettingsSection />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in max-w-xl">
				<CardHeader>
					<CardTitle className="text-2xl">{m.admin_nav_general_todo_title()}</CardTitle>
					<CardDescription>{m.admin_nav_general_todo_description()}</CardDescription>
				</CardHeader>
				<CardContent>
					<ClientOnly>
						<TodoSettingsSection />
					</ClientOnly>
				</CardContent>
			</Card>
			<Card className="animate-page-in max-w-xl">
				<CardHeader>
					<CardTitle className="text-2xl">{m.admin_nav_general_observability_title()}</CardTitle>
					<CardDescription>{m.admin_nav_general_observability_description()}</CardDescription>
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
