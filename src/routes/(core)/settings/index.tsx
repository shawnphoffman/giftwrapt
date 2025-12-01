import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
// import { Button } from '@react-email/components'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(core)/settings/')({
	component: SettingsPage,
})

function SettingsPage() {
	return (
		<div className="grid gap-6 animate-page-in">
			<Card className="bg-accent">
				<CardHeader>
					<CardTitle>Profile</CardTitle>
				</CardHeader>
				<CardContent>
					<Skeleton className="h-10 w-full" />
					{/* <div className="flex flex-col items-center w-full gap-4 xs:flex-row">
						<ProfileAvatarUpload image={user?.image} displayName={user?.display_name} />
						<ProfileForm name={user.display_name} id={user.user_id} birthMonth={user.birth_month} birthDay={user.birth_day} />
					</div> */}
				</CardContent>
				{/* <CardFooter className="px-6 py-4 border-t">
					<Button type="submit" form="update-profile-form">
						Save
					</Button>
				</CardFooter> */}
			</Card>
		</div>
	)
}
