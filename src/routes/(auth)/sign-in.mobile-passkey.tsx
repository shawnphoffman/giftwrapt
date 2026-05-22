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
//
// DIAGNOSTIC BUILD: prints each step inline so we can see where the
// chain breaks on iOS without attaching Safari Web Inspector. The
// "Open redirect manually" button bypasses the WebAuthn step entirely
// and just hits `_native-done`, so we can tell whether the bounce
// itself (302 -> wishlists://) is working independently of the
// ceremony. Remove once the iOS sign-in issue is resolved.

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

type LogEntry = { ts: string; line: string }

function MobilePasskeyPage() {
	const { token } = Route.useSearch()
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [log, setLog] = useState<Array<LogEntry>>([])

	const finishUrl = token ? `/api/mobile/v1/auth/passkey/_native-done?token=${encodeURIComponent(token)}` : null

	const append = (line: string) => {
		console.log('[mobile-passkey]', line)
		setLog(prev => [...prev, { ts: new Date().toISOString().slice(11, 23), line }])
	}

	const handlePasskey = async () => {
		if (!finishUrl) return
		setIsLoading(true)
		setError(null)
		append(`token present (${token?.slice(0, 8)}...), finishUrl=${finishUrl}`)
		append('calling authClient.signIn.passkey()')
		try {
			const result = await authClient.signIn.passkey()
			append(
				`signIn.passkey resolved: error=${result.error ? JSON.stringify(result.error) : 'null'}, data=${result.data ? 'present' : 'null'}`
			)
			if (result.error) throw new Error(result.error.message ?? 'sign-in failed')
			append('about to window.location.replace(finishUrl)')
			window.location.replace(finishUrl)
			append('window.location.replace returned (navigation queued)')
		} catch (e) {
			append(`exception: ${e instanceof Error ? e.message : String(e)}`)
			setError("Couldn't sign in with that passkey. Try again or close the sheet to use your password.")
		} finally {
			setIsLoading(false)
		}
	}

	const handleManualRedirect = () => {
		if (!finishUrl) return
		append('manual redirect: window.location.replace(finishUrl) (no passkey ceremony)')
		window.location.replace(finishUrl)
	}

	if (!token) {
		return (
			<div className="relative flex min-h-screen items-center justify-center p-6">
				<div className="absolute inset-0 -z-10 overflow-hidden">
					<GradientBackground />
				</div>
				<div className="bg-background/80 w-full max-w-md space-y-3 rounded-xl p-6 text-center shadow-md backdrop-blur">
					<h1 className="text-lg font-semibold">Sign-in link expired</h1>
					<p className="text-muted-foreground text-sm">Reopen the GiftWrapt iOS app and tap the passkey button again.</p>
				</div>
			</div>
		)
	}

	return (
		<div className="relative flex min-h-screen items-center justify-center p-6">
			<div className="absolute inset-0 -z-10 overflow-hidden">
				<GradientBackground />
			</div>
			<div className="bg-background/80 w-full max-w-md space-y-4 rounded-xl p-6 shadow-md backdrop-blur">
				<div className="space-y-1">
					<h1 className="text-lg font-semibold">Sign in with a passkey</h1>
					<p className="text-muted-foreground text-sm">Confirm with Face ID or Touch ID to finish signing in.</p>
				</div>
				<Button type="button" className="w-full" disabled={isLoading} onClick={handlePasskey}>
					{isLoading ? 'Authenticating…' : 'Use a passkey'}
				</Button>
				<Button type="button" variant="outline" className="w-full" onClick={handleManualRedirect}>
					Open redirect manually (diagnostic)
				</Button>
				{error && <p className="text-sm text-red-500">{error}</p>}
				{log.length > 0 && (
					<pre className="bg-muted/60 max-h-64 overflow-auto rounded p-3 text-xs leading-tight whitespace-pre-wrap">
						{log.map(entry => `${entry.ts}  ${entry.line}`).join('\n')}
					</pre>
				)}
			</div>
		</div>
	)
}
