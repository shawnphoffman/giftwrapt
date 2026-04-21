import { createFileRoute } from '@tanstack/react-router'

import UserAvatar from '@/components/common/user-avatar'
// import AvatarUpload from '@/components/settings/avatar-upload'
import ProfileForm from '@/components/settings/profile-form'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSession } from '@/lib/auth-client'

export const Route = createFileRoute('/(core)/settings/')({
	component: SettingsPage,
})

function SettingsPage() {
	const { data: session } = useSession()

	if (!session?.user) {
		return null
	}

	return (
		<div className="animate-page-in gap-6 flex flex-col">
			{/* <CardHeader className="flex"> Do this when there is no description*/}
			<CardHeader>
				<CardTitle className="text-2xl">Profile</CardTitle>
				<CardDescription>Update your profile information.</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex flex-col items-center w-full gap-4 @md/subpage:flex-row @md/subpage:items-start">
					<UserAvatar size="huge" name={session.user.name} image={session.user.image} />
					{/* <AvatarUpload image={session.user.image} displayName={session.user.name} /> */}
					<ProfileForm
						name={session.user.name || ''}
						birthMonth={session.user.birthMonth}
						birthDay={session.user.birthDay}
						partnerId={session.user.partnerId}
					/>
				</div>
			</CardContent>
		</div>
	)
}
