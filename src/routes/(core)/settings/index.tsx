import { createFileRoute } from '@tanstack/react-router'

import AvatarUpload from '@/components/settings/avatar-upload'
import ProfileForm from '@/components/settings/profile-form'
import { RelationLabelsSection } from '@/components/settings/relation-labels-section'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAppSettings } from '@/hooks/use-app-settings'
import { useSession } from '@/lib/auth-client'
import { m } from '@/paraglide/messages.js'

export const Route = createFileRoute('/(core)/settings/')({
	component: SettingsPage,
})

function SettingsPage() {
	const { data: session } = useSession()
	const { data: appSettings } = useAppSettings()

	if (!session?.user) {
		return null
	}

	return (
		<div className="animate-page-in grid gap-6">
			<Card className="max-w-2xl">
				<CardHeader>
					<CardTitle className="text-2xl">{m.settings_profile_title()}</CardTitle>
					<CardDescription>{m.settings_profile_description()}</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex flex-col items-center w-full gap-4 @md/subpage:flex-row @md/subpage:items-start">
						<AvatarUpload image={session.user.image} displayName={session.user.name} />
						<ProfileForm
							name={session.user.name || ''}
							birthMonth={session.user.birthMonth}
							birthDay={session.user.birthDay}
							birthYear={session.user.birthYear}
							partnerId={session.user.partnerId}
							partnerAnniversary={session.user.partnerAnniversary}
						/>
					</div>
				</CardContent>
			</Card>

			{(appSettings?.enableMothersDayReminders || appSettings?.enableFathersDayReminders) && (
				<Card className="max-w-2xl">
					<CardHeader>
						<CardTitle className="text-2xl">{m.settings_relations_title()}</CardTitle>
						<CardDescription>{m.settings_relations_description()}</CardDescription>
					</CardHeader>
					<CardContent>
						<RelationLabelsSection
							showMothers={appSettings.enableMothersDayReminders}
							showFathers={appSettings.enableFathersDayReminders}
						/>
					</CardContent>
				</Card>
			)}
		</div>
	)
}
