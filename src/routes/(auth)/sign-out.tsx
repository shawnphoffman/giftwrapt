import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import Loading from '@/components/loading'
import { signOut } from '@/lib/auth-client'

export const Route = createFileRoute('/(auth)/sign-out')({
	component: SignOut,
})

function SignOut() {
	const navigate = useNavigate()
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		const handleSignOut = async () => {
			try {
				await signOut()
				// Redirect to sign-in page after successful sign out
				navigate({ to: '/sign-in' })
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to sign out')
				// Still redirect even if there's an error
				setTimeout(() => {
					navigate({ to: '/sign-in' })
				}, 2000)
			}
		}

		handleSignOut()
	}, [navigate])

	if (error) {
		return (
			<div className="flex items-center justify-center min-h-[calc(100vh-3rem)] p-4">
				<div className="text-center space-y-4">
					<p className="text-destructive">{error}</p>
					<p className="text-sm text-muted-foreground">Redirecting to sign in...</p>
				</div>
			</div>
		)
	}

	return (
		<div className="flex items-center justify-center min-h-[calc(100vh-3rem)] p-4">
			<div className="text-center space-y-4">
				<Loading className="text-primary" />
				<p className="text-muted-foreground">Signing out...</p>
			</div>
		</div>
	)
}
