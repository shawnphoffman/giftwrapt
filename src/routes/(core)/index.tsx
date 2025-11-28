import { useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { signOut, useSession } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/(core)/')({ component: App })

async function App() {
	const navigate = useNavigate()
	const { data: session, isPending } = useSession()

	// Redirect to sign-in if not authenticated
	useEffect(() => {
		if (!isPending && !session?.user) {
			navigate({ to: '/sign-in' })
		}
	}, [session, isPending, navigate])

	await new Promise(resolve => setTimeout(resolve, 10000))

	// Show loading state while checking session
	// if (isPending) {
	// 	return (
	// 		<div className="flex items-center justify-center min-h-screen">
	// 			<p>Loading...</p>
	// 		</div>
	// 	)
	// }

	// Don't render content if not authenticated (redirect will happen)
	if (!session?.user) {
		return null
	}

	return (
		<div className="">
			<header className="top-0 z-10 flex items-center h-12 gap-2 shrink-0">
				<div className="flex items-center gap-2 px-4">
					<h1 className="text-3xl font-bold">Welcome, TanStack Start Starter</h1>
				</div>
			</header>
			<div className="flex flex-col items-center flex-1 gap-4 p-4 pt-2">
				<div className="flex flex-col items-center gap-4 p-6 border rounded-lg w-full max-w-md">
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
		</div>
	)
}
