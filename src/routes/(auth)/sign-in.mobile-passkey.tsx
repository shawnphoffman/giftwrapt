// Stripped-down sign-in page used by the iOS passkey flow. The
// iOS app opens this URL (with a server-issued `?token=...`) inside
// `ASWebAuthenticationSession`. The page renders a single passkey
// button; tapping it triggers browser-native WebAuthn against the
// server's relying party (no app entitlement needed). On success the
// page navigates to `/api/mobile/v1/auth/passkey/_native-done?token=...`,
// which mints the apiKey + 302s to the iOS custom scheme so the auth
// session returns control to the app.
//
// The token is the same opaque challenge token the iOS app got back
// from `POST /v1/auth/passkey/begin`; it carries the deviceName and
// admin-whitelisted redirectUri, both of which `_native-done`
// validates.

import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { GradientBackground } from '@/components/ui/gradient-background'
import { authClient } from '@/lib/auth-client'

type Search = { token?: string }

export const Route = createFileRoute('/(auth)/sign-in/mobile-passkey')({
	validateSearch: (search: Record<string, unknown>): Search => {
		return typeof search.token === 'string' && search.token.length > 0 ? { token: search.token } : {}
	},
	component: MobilePasskeyPage,
})

function MobilePasskeyPage() {
	const { token } = Route.useSearch()
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const finishUrl = token ? `/api/mobile/v1/auth/passkey/_native-done?token=${encodeURIComponent(token)}` : null

	const handlePasskey = async () => {
		if (!finishUrl) return
		setIsLoading(true)
		setError(null)
		try {
			const { error: passkeyError } = await authClient.signIn.passkey()
			if (passkeyError) throw new Error(passkeyError.message ?? 'sign-in failed')
			// Full-page navigation to the mobile-api callback so the
			// freshly-set session cookie rides along. The callback
			// 302s to the iOS custom scheme, which
			// `ASWebAuthenticationSession` captures.
			window.location.assign(finishUrl)
		} catch {
			setError("Couldn't sign in with that passkey. Try again or close the sheet to use your password.")
		} finally {
			setIsLoading(false)
		}
	}

	if (!token) {
		return (
			<div className="relative flex items-center justify-center min-h-screen p-6">
				<div className="absolute inset-0 -z-10 overflow-hidden">
					<GradientBackground />
				</div>
				<div className="bg-background/80 backdrop-blur rounded-xl shadow-md p-6 max-w-md w-full text-center space-y-3">
					<h1 className="text-lg font-semibold">Sign-in link expired</h1>
					<p className="text-sm text-muted-foreground">Reopen the GiftWrapt iOS app and tap the passkey button again.</p>
				</div>
			</div>
		)
	}

	return (
		<div className="relative flex items-center justify-center min-h-screen p-6">
			<div className="absolute inset-0 -z-10 overflow-hidden">
				<GradientBackground />
			</div>
			<div className="bg-background/80 backdrop-blur rounded-xl shadow-md p-6 max-w-md w-full space-y-4">
				<div className="space-y-1">
					<h1 className="text-lg font-semibold">Sign in with a passkey</h1>
					<p className="text-sm text-muted-foreground">Confirm with Face ID or Touch ID to finish signing in.</p>
				</div>
				<Button type="button" className="w-full" disabled={isLoading} onClick={handlePasskey}>
					{isLoading ? 'Authenticating…' : 'Use a passkey'}
				</Button>
				{error && <p className="text-sm text-red-500">{error}</p>}
			</div>
		</div>
	)
}
