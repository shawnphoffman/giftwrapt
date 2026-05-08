import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { sql } from 'drizzle-orm'
import { useEffect } from 'react'

import { fetchPublicOidcClientInfo } from '@/api/admin-oidc-client'
import { SignInPageContent } from '@/components/auth/sign-in-page'
import Loading from '@/components/loading'
import { db } from '@/db'
import { users } from '@/db/schema'
import { useAppSetting } from '@/hooks/use-app-settings'
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
// backslash tricks. Reject TanStack Start internal paths (`/_serverFn`, etc.)
// so post-auth navigation can't land on a server-fn endpoint and render raw
// seroval data instead of a page. Falls back to `/` for anything malformed.
const safeRedirect = (raw: unknown): string => {
	if (typeof raw !== 'string') return '/'
	if (raw.length === 0 || raw.length > 2000) return '/'
	if (!raw.startsWith('/')) return '/'
	if (raw.startsWith('//') || raw.startsWith('/\\')) return '/'
	if (raw.startsWith('/_')) return '/'
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
	const passkeysEnabled = useAppSetting('enablePasskeys')
	const { data: oidcInfo } = useQuery({
		queryKey: ['public', 'oidc-client-info'],
		queryFn: () => fetchPublicOidcClientInfo(),
		staleTime: 5 * 60 * 1000,
	})

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
		const { data, error: signInError } = await authClient.signIn.email({ email, password })
		if (signInError) throw new Error('sign-in failed')

		// 2FA hand-off: when the user has TOTP enrolled, better-auth's
		// twoFactor plugin replaces the post-sign-in session with a
		// short-lived 2FA-pending cookie and returns
		// `{ twoFactorRedirect: true }` on the body. Better-auth's
		// sign-in response type doesn't include the plugin-augmented
		// shape, so cast through `unknown` to read the flag.
		const twoFactorPending = (data as unknown as { twoFactorRedirect?: boolean }).twoFactorRedirect === true
		if (twoFactorPending) {
			const target = safeRedirect(redirectRaw)
			const params = new URLSearchParams()
			if (target !== '/') params.set('redirect', target)
			window.location.assign(`/sign-in/two-factor${params.toString() ? `?${params.toString()}` : ''}`)
			return
		}

		goPostAuth()
	}

	const handlePasskeySignIn = async () => {
		const { error: passkeyError } = await authClient.signIn.passkey()
		if (passkeyError) throw new Error('passkey sign-in failed')
		goPostAuth()
	}

	const handleOidcSignIn = async () => {
		// `signIn.oauth2` (genericOAuth's web entry point) issues a
		// 302 to the IdP authorize URL with the better-auth state
		// cookie set. The `callbackURL` is where better-auth's
		// /api/auth/oauth2/callback/oidc redirects to after the code
		// exchange + session mint, which is just the post-auth target
		// for us.
		const callbackURL = safeRedirect(redirectRaw)
		const { error } = await authClient.signIn.oauth2({ providerId: 'oidc', callbackURL })
		if (error) throw new Error(error.message ?? 'oidc sign-in failed')
		// authClient handles the redirect; we don't need to call
		// goPostAuth - the IdP roundtrip will land us back on
		// `callbackURL` once authenticated.
	}

	if (isPending) {
		return (
			<div
				className="flex items-center justify-center w-full h-screen"
				style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
			>
				<Loading />
			</div>
		)
	}

	// Don't render form if already authenticated (redirect will happen)
	if (session?.user) {
		return null
	}

	return (
		<SignInPageContent
			onSubmit={handleSignIn}
			forgotPasswordHref="/forgot-password"
			onSignInWithPasskey={passkeysEnabled ? handlePasskeySignIn : undefined}
			onSignInWithOidc={oidcInfo?.enabled ? handleOidcSignIn : undefined}
			oidcButtonText={oidcInfo?.buttonText}
		/>
	)
}
