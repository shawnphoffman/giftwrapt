import { Image } from '@unpic/react'
import { CheckCircle2, ShieldCheck } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { GradientBackground } from '@/components/ui/gradient-background'
import logo from '@/images/logo.webp'

// Reasonable human-readable copy for the standard OIDC scopes
// better-auth advertises (openid + profile + email + offline_access).
// Anything else falls through to a generic "Other access" line.
const SCOPE_DESCRIPTIONS: Record<string, string> = {
	openid: 'Confirm your identity',
	profile: 'Read your name and avatar',
	email: 'Read your email address',
	offline_access: 'Stay signed in (refresh tokens)',
}

export function formatScopeLabel(scope: string): string {
	return SCOPE_DESCRIPTIONS[scope] ?? `Other access (${scope})`
}

export type OAuthConsentClient = {
	clientId: string
	name: string
	icon: string | null
}

export type OAuthConsentPageContentProps = {
	client: OAuthConsentClient | null
	scopes: Array<string>
	onApprove: () => Promise<void>
	onDeny: () => Promise<void>
	signInHref: string
	initialError?: string | null
	forceLoading?: boolean
}

export function OAuthConsentPageContent({
	client,
	scopes,
	onApprove,
	onDeny,
	signInHref,
	initialError = null,
	forceLoading = false,
}: OAuthConsentPageContentProps) {
	const [busy, setBusy] = useState<'approve' | 'deny' | null>(null)
	const [error, setError] = useState<string | null>(initialError)

	const handle = async (action: 'approve' | 'deny') => {
		setError(null)
		setBusy(action)
		try {
			if (action === 'approve') await onApprove()
			else await onDeny()
		} catch {
			setError('Something went wrong. Try again.')
		} finally {
			setBusy(null)
		}
	}

	const showLoading = busy !== null || forceLoading

	if (!client) {
		return (
			<div className="relative flex flex-col items-center min-h-screen p-[10%] gap-4">
				<div className="absolute inset-0 -z-10 overflow-hidden">
					<GradientBackground />
				</div>
				<Image src={logo} alt="GiftWrapt" width={160} height={160} className="w-24 sm:w-40" />
				<div className="w-full max-w-md space-y-4 rounded-lg border bg-background/80 p-6 shadow-lg backdrop-blur">
					<h1 className="text-3xl font-bold">Unknown app</h1>
					<p className="text-muted-foreground">
						This consent link is for a client that no longer exists. Ask the app's developer for an updated sign-in URL.
					</p>
					<Button asChild variant="outline" className="w-full">
						<a href={signInHref}>Back to GiftWrapt</a>
					</Button>
				</div>
			</div>
		)
	}

	return (
		<div className="relative flex flex-col items-center min-h-screen p-[10%] gap-4">
			<div className="absolute inset-0 -z-10 overflow-hidden">
				<GradientBackground />
			</div>
			<Image src={logo} alt="GiftWrapt" width={160} height={160} className="w-24 sm:w-40" />

			<div className="w-full max-w-md space-y-4 rounded-lg border bg-background/80 p-6 shadow-lg backdrop-blur">
				<div className="text-center space-y-3">
					<div className="flex items-center justify-center gap-2">
						{client.icon ? (
							<img src={client.icon} alt="" className="size-10 rounded-md ring-1 ring-border" />
						) : (
							<div className="flex size-10 items-center justify-center rounded-md bg-muted ring-1 ring-border">
								<ShieldCheck className="size-5 text-muted-foreground" />
							</div>
						)}
					</div>
					<h1 className="text-2xl font-bold">Sign in to {client.name}?</h1>
					<p className="text-sm text-muted-foreground">{client.name} wants to use your GiftWrapt account.</p>
				</div>

				<div className="rounded-md border p-3">
					<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">It will be able to:</p>
					<ul className="space-y-1.5">
						{scopes.length === 0 ? (
							<li className="text-sm text-muted-foreground">No special access requested.</li>
						) : (
							scopes.map(scope => (
								<li key={scope} className="flex items-start gap-2 text-sm">
									<CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-500" />
									<span>{formatScopeLabel(scope)}</span>
								</li>
							))
						)}
					</ul>
				</div>

				{error && <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">{error}</div>}

				<div className="flex flex-col-reverse gap-2 sm:flex-row">
					<Button type="button" variant="outline" className="flex-1" onClick={() => handle('deny')} disabled={showLoading}>
						{busy === 'deny' ? 'Cancelling…' : 'Cancel'}
					</Button>
					<Button type="button" className="flex-1" onClick={() => handle('approve')} disabled={showLoading}>
						{busy === 'approve' ? 'Approving…' : `Continue as you`}
					</Button>
				</div>

				<p className="text-xs text-muted-foreground text-center">
					Approving will redirect you back to {client.name}. You can revoke access any time from this server's admin panel.
				</p>
			</div>
		</div>
	)
}
