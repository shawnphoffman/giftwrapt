import { passkeyClient } from '@better-auth/passkey/client'
import { adminClient, customSessionClient, genericOAuthClient, twoFactorClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

import { env } from '@/env'
import type { auth } from '@/lib/auth'

// When VITE_SERVER_URL isn't set at build time, omit baseURL so better-auth
// falls back to window.location.origin in the browser. Critical for self-hosted
// deployments: VITE_* vars bake in at build time, so a pre-built image can't
// know the eventual public URL.
export const authClient = createAuthClient({
	...(env.VITE_SERVER_URL ? { baseURL: env.VITE_SERVER_URL } : {}),
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

export const { useSession, signIn, signUp, signOut, updateUser } = authClient
