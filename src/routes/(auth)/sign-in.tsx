import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { sql } from 'drizzle-orm'
import { useEffect, useRef } from 'react'

import { fetchPublicOidcClientInfo } from '@/api/admin-oidc-client'
import { SignInPageContent } from '@/components/auth/sign-in-page'
import Loading from '@/components/loading'
import { db } from '@/db'
import { users } from '@/db/schema'
import { useAppSetting } from '@/hooks/use-app-settings'
import { authClient, useSession } from '@/lib/auth-client'
import { passThroughSearch, resolvePostAuthRedirect } from '@/lib/oauth-relay'
import { safeRedirect } from '@/lib/safe-redirect'

const checkNeedsBootstrap = createServerFn({ method: 'GET' }).handler(async () => {
	const rows = await db
		.select({ c: sql<number>`count(*)::int` })
		.from(users)
		.where(sql`role = 'admin'`)
	return { needsBootstrap: (rows[0]?.c ?? 0) === 0 }
})

export const Route = createFileRoute('/(auth)/sign-in')({
	// The MCP OAuth flow lands here as `/sign-in?<authorize query>`
	// (better-auth's `mcp()` plugin redirects unauthenticated authorize
	// requests to the login page with the original query). The search is
	// kept verbatim and folded into the post-auth target when read; folding
	// it here made the router redirect to itself forever (see oauth-relay.ts).
	validateSearch: passThroughSearch,
	component: SignIn,
	beforeLoad: async () => {
		const { needsBootstrap } = await checkNeedsBootstrap()
		if (needsBootstrap) throw redirect({ to: '/sign-up' })
	},
})

function SignIn() {
	const search = Route.useSearch()
	const redirectRaw = resolvePostAuthRedirect(search)
	const { data: session, isPending } = useSession()
	// `useSession` revalidates on window focus, flipping `isPending` true on
	// every tab-return. If we render `<Loading />` during those refetches the
	// form unmounts and its useState-held email/password is wiped, which is
	// hostile when someone tabs away to grab a password from 1Password. Only
	// gate on `isPending` during the very first resolution; background
	// refetches keep the form mounted.
	const hasResolvedSessionRef = useRef(false)
	if (!isPending) hasResolvedSessionRef.current = true
	const showInitialLoading = isPending && !hasResolvedSessionRef.current
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

	// When a sign-in happens mid OAuth flow, the `mcp()` plugin's after-hook
	// replays the pending authorize request inside the sign-in response and
	// answers with `{ redirect: true, url }` pointing at the consent page.
	// Follow it directly instead of racing better-auth's client redirect
	// plugin against `goPostAuth`, which would otherwise strand the flow at `/`.
	const followHookRedirect = (data: unknown): boolean => {
		const hook = data as { redirect?: boolean; url?: string } | null
		if (hook?.redirect === true && typeof hook.url === 'string' && hook.url.length > 0) {
			window.location.assign(hook.url)
			return true
		}
		return false
	}

	const handleSignIn = async (email: string, password: string) => {
		// Generic error to avoid user enumeration. Better-auth's per-case
		// messages ("user not found" vs "invalid credentials") leak whether
		// an email exists in the DB. We don't surface those to the client
		// here; the actual error is in the server logs. See sec-review M5.
		const { data, error: signInError } = await authClient.signIn.email({ email, password })
		if (signInError) throw new Error('sign-in failed')
		if (followHookRedirect(data)) return

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
		const { data, error: passkeyError } = await authClient.signIn.passkey()
		if (passkeyError) throw new Error('passkey sign-in failed')
		if (followHookRedirect(data)) return
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

	if (showInitialLoading) {
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
