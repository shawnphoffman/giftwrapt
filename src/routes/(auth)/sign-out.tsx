import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import Loading from '@/components/loading'
import { signOut } from '@/lib/auth-client'

export const Route = createFileRoute('/(auth)/sign-out')({
	component: SignOut,
})

function SignOut() {
	const navigate = useNavigate()
	const router = useRouter()
	const queryClient = useQueryClient()
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		const handleSignOut = async () => {
			// Race the better-auth call against a 4s ceiling so a hung
			// network or a serverless cold-start DB stall doesn't leave the
			// user stuck on "Signing out...". The browser cookie still goes
			// out as soon as the response comes back; if it never does, the
			// next route's middleware/sign-in flow will treat the cookie as
			// stale and clear it.
			const SIGN_OUT_TIMEOUT_MS = 4_000
			// Drop every client-side cache so the next user doesn't see the
			// previous user's data: queryClient is a module-level singleton
			// (root-provider.tsx) and TanStack DB collections (db-collections/)
			// share it, so clearing here drains both. router.invalidate()
			// forces loaders to refetch on the next route.
			const purgeCaches = async () => {
				queryClient.clear()
				await router.invalidate()
			}
			try {
				await Promise.race([
					signOut(),
					new Promise((_, reject) => setTimeout(() => reject(new Error('sign-out timed out')), SIGN_OUT_TIMEOUT_MS)),
				])
				await purgeCaches()
				navigate({ to: '/sign-in' })
			} catch (err) {
				await purgeCaches()
				setError(err instanceof Error ? err.message : 'Failed to sign out')
				setTimeout(() => {
					navigate({ to: '/sign-in' })
				}, 2000)
			}
		}

		handleSignOut()
	}, [navigate, router, queryClient])

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
