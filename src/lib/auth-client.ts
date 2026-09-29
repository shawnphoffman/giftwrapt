import { passkeyClient } from '@better-auth/passkey/client'
import { useHydrated } from '@tanstack/react-router'
import { adminClient, customSessionClient, genericOAuthClient, twoFactorClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

import type { auth } from '@/lib/auth'

// No baseURL: better-auth falls back to window.location.origin in the
// browser. Critical for self-hosted deployments where pre-built images
// can't know the eventual public URL.
export const authClient = createAuthClient({
	plugins: [
		adminClient(),
		customSessionClient<typeof auth>(),
		// `redirect: false`, since we drive routing ourselves so the
		// challenge step lands on /sign-in/two-factor with the
		// `?redirect=` param preserved instead of jumping straight to
		// `/`. The plugin still throws a `TWO_FACTOR_REQUIRED`-shaped
		// response which the sign-in page maps to a navigate call.
		twoFactorClient({ onTwoFactorRedirect: () => {} }),
		passkeyClient(),
		// External OIDC sign-in (sign INTO GiftWrapt with an external
		// IdP). The server-side plugin is loaded conditionally based
		// on admin settings; this client runtime is loaded
		// unconditionally so calls fail with a documented error
		// instead of 404 when no provider is configured.
		genericOAuthClient(),
	],
})

export const { signIn, signUp, signOut, updateUser } = authClient

type SessionState = ReturnType<typeof authClient.useSession>

// Hydration-safe wrapper around better-auth's `useSession`. Its React binding
// passes the live client snapshot as `useSyncExternalStore`'s
// `getServerSnapshot`, but the server never fetches the session, so SSR always
// renders the pending state. A component that hydrates after another consumer
// has already loaded the session (e.g. `NavUser`, inside a Suspense boundary
// that hydrates in a later pass than the sidebar's admin links) would render
// the signed-in branch against the server's pending HTML and throw a hydration
// mismatch. While hydrating, report the same pending state the server
// rendered; `useHydrated` flips to true right after, and the live value takes
// over. Components mounted after hydration get the live value immediately.
export function useSession(): SessionState {
	const live = authClient.useSession()
	const hydrated = useHydrated()
	if (hydrated) return live
	return { data: null, error: null, isPending: true, isRefetching: false, refetch: live.refetch }
}
