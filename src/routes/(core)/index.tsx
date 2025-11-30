import { useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { signOut, useSession } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import Loading from '@/components/loading'
import { SonnerTypes } from '@/components/utilities/sonner-types'

export const Route = createFileRoute('/(core)/')({
	component: IndexPage,
})

function IndexPage() {
	const navigate = useNavigate()
	const { data: session, isPending } = useSession()

	// console.log('session', session)

	// Redirect to sign-in if not authenticated
	useEffect(() => {
		if (!isPending && !session?.user) {
			navigate({ to: '/sign-in' })
		}
	}, [session, isPending, navigate])

	// Show loading state while checking session
	if (isPending) {
		return <Loading />
	}

	// Don't render content if not authenticated (redirect will happen)
	if (!session?.user) {
		return null
	}

	return (
		<div className="">
			<h1 className="text-3xl font-bold">Welcome, {session.user.name}</h1>

			<div className="flex flex-col items-center flex-1 gap-4 p-4 pt-2">
				<div className="flex flex-col items-center gap-4 p-6 border rounded-lg max-w-md">
					<div className="text-center">
						<p className="text-lg font-semibold">Signed in as</p>
						<p className="text-primary">{session.user.email}</p>
						{session.user.name && <p className="text-muted-foreground">{session.user.name}</p>}
					</div>
					<Button
						onClick={async () => {
							await signOut()
						}}
						variant="outline"
					>
						Sign out
					</Button>
				</div>
				{/* <pre>{JSON.stringify(env, null, 2)}</pre> */}
			</div>
			<SonnerTypes />
		</div>
	)
}
