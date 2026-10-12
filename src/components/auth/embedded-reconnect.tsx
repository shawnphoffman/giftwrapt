import { useEffect } from 'react'

import Loading from '@/components/loading'
import { Button } from '@/components/ui/button'
import { postToNativeBridge } from '@/lib/embedded'

export type EmbeddedReconnectProps = {
	// Same-origin path the app should land on after it re-runs the handoff.
	to: string
}

/**
 * What the auth pages render inside the iOS web tab instead of a form
 * (plan 28). The web view never shows sign-in, sign-up, forgot-password,
 * or the two-factor challenge: passkeys cannot complete in a
 * tenant-agnostic web view, and the app signs in by handoff. Mounting
 * this screen posts `{ type: 'reauth', to }` to the native bridge; the
 * app mints a fresh handoff token and reloads the web view on `to`.
 * The button re-posts in case the first message was missed.
 */
export function EmbeddedReconnect({ to }: EmbeddedReconnectProps) {
	useEffect(() => {
		postToNativeBridge({ type: 'reauth', to })
	}, [to])

	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
			<Loading className="text-primary" />
			<div className="space-y-1">
				<h1 className="text-xl font-semibold">Reconnecting to GiftWrapt</h1>
				<p className="text-sm text-muted-foreground">Signing you back in from the app.</p>
			</div>
			<Button type="button" variant="outline" onClick={() => postToNativeBridge({ type: 'reauth', to })}>
				Try Again
			</Button>
		</div>
	)
}
