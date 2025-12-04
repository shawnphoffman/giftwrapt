import { createFileRoute } from '@tanstack/react-router'
import { signOut, useSession } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import Loading from '@/components/loading'
import { SonnerTypes } from '@/components/utilities/sonner-types'

export const Route = createFileRoute('/(core)/')({
	component: IndexPage,
})

function IndexPage() {
	const { data: session, isPending } = useSession()

	// Show loading state while checking session
	if (isPending) {
		return <Loading />
	}

	const user = session!.user

	return (
		<div className="">
			<h1 className="text-3xl font-bold">Welcome, {user.name}</h1>

			<div className="flex flex-col items-center flex-1 gap-4 p-4 pt-2">
				<div className="flex flex-col items-center gap-4 p-6 border rounded-lg max-w-md">
					<div className="text-center">
						<p className="text-lg font-semibold">Signed in as</p>
						<p className="text-primary">{user.email}</p>
						{user.name && <p className="text-muted-foreground">{user.name}</p>}
					</div>
					<Button onClick={async () => await signOut()} variant="outline">
						Sign out
					</Button>
				</div>
			</div>
			<SonnerTypes />
		</div>
	)
}
