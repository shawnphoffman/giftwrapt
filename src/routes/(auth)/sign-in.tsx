import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { sql } from 'drizzle-orm'
import { useEffect } from 'react'

import { SignInPageContent } from '@/components/auth/sign-in-page'
import Loading from '@/components/loading'
import { db } from '@/db'
import { users } from '@/db/schema'
import { authClient, useSession } from '@/lib/auth-client'

const checkNeedsBootstrap = createServerFn({ method: 'GET' }).handler(async () => {
	const rows = await db
		.select({ c: sql<number>`count(*)::int` })
		.from(users)
		.where(sql`role = 'admin'`)
	return { needsBootstrap: (rows[0]?.c ?? 0) === 0 }
})

type SignInSearch = { redirect?: string }

// Only allow same-origin paths to prevent open-redirect via the `redirect`
// search param. Reject protocol-relative (`//evil.com`), absolute URLs, and
// backslash tricks. Falls back to `/` for anything malformed.
const safeRedirect = (raw: unknown): string => {
	if (typeof raw !== 'string') return '/'
	if (raw.length === 0 || raw.length > 2000) return '/'
	if (!raw.startsWith('/')) return '/'
	if (raw.startsWith('//') || raw.startsWith('/\\')) return '/'
	try {
		const parsed = new URL(raw, 'http://placeholder.invalid')
		if (parsed.origin !== 'http://placeholder.invalid') return '/'
	} catch {
		return '/'
	}
	return raw
}

export const Route = createFileRoute('/(auth)/sign-in')({
	validateSearch: (search: Record<string, unknown>): SignInSearch => {
		return typeof search.redirect === 'string' ? { redirect: search.redirect } : {}
	},
	component: SignIn,
	beforeLoad: async () => {
		const { needsBootstrap } = await checkNeedsBootstrap()
		if (needsBootstrap) throw redirect({ to: '/sign-up' })
	},
})

function SignIn() {
	const { redirect: redirectRaw } = Route.useSearch()
	const { data: session, isPending } = useSession()

	// Hard-reload after sign-in instead of SPA-navigating. The QueryClient and
	// TanStack DB collections are module-level singletons, and on mobile Safari
	// the new auth cookie can lag behind the JS promise resolution. Both make
	// SPA navigation race-prone. A full reload boots the next page with the
	// cookie committed and a fresh client state.
	const goPostAuth = () => {
		const target = safeRedirect(redirectRaw)
		window.location.assign(target)
	}

	// Redirect to home (or the captured share-target) once auth state lands.
	useEffect(() => {
		if (!isPending && session?.user) {
			goPostAuth()
		}
	}, [session, isPending, redirectRaw])

	const handleSignIn = async (email: string, password: string) => {
		// Generic error to avoid user enumeration. Better-auth's per-case
		// messages ("user not found" vs "invalid credentials") leak whether
		// an email exists in the DB. We don't surface those to the client
		// here; the actual error is in the server logs. See sec-review M5.
		const { error: signInError } = await authClient.signIn.email(
			{ email, password },
			{
				onSuccess: () => {
					goPostAuth()
				},
			}
		)

		if (signInError) throw new Error('sign-in failed')
	}

	if (isPending) {
		return (
			<div className="flex items-center justify-center w-full h-screen">
				<Loading />
			</div>
		)
	}

	// Don't render form if already authenticated (redirect will happen)
	if (session?.user) {
		return null
	}

	return <SignInPageContent onSubmit={handleSignIn} forgotPasswordHref="/forgot-password" />
}
