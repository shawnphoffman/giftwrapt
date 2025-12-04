import { CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import AvatarUpload from '@/components/settings/avatar-upload'
import ProfileForm from '@/components/settings/profile-form'
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
			<CardHeader className="flex">
				<CardTitle className="text-2xl">Profile</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="flex flex-col items-start w-full gap-4 sm:flex-row">
					<AvatarUpload image={session.user.image} displayName={session.user.name} />
					{/* <div className="flex-1 w-full"> */}
					<ProfileForm name={session.user.name || ''} birthMonth={session.user.birthMonth} birthDay={session.user.birthDay} />
					{/* </div> */}
				</div>
			</CardContent>
			<CardFooter>
				<Button type="submit" form="update-profile-form">
					Save
				</Button>
			</CardFooter>
		</div>
	)
}
