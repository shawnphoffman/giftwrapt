import { Bot, ShieldCheck } from 'lucide-react'
import { useState } from 'react'

import Loading from '@/components/loading'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

export type OAuthConsentState =
	// Waiting on the client lookup.
	| 'loading'
	// Everything resolved; show the Allow / Deny buttons.
	| 'ready'
	// The admin has the MCP surface switched off.
	| 'disabled'
	// The consent code is missing, expired, or already used.
	| 'expired'
	// The user clicked Deny; the client is being told.
	| 'declined'

export type OAuthConsentCardProps = {
	state: OAuthConsentState
	/** Registered display name of the client asking for access, when known. */
	clientName?: string | null
	/** The signed-in user's email, so they can tell which account is being connected. */
	accountEmail?: string | null
	/** Error from a failed accept / deny call, if any. */
	error?: string | null
	/**
	 * Records the decision. Resolves `true` when the browser is being handed
	 * to the client's redirect URI (the buttons then stay disabled until the
	 * page unloads), `false` when the call failed and the user may retry.
	 */
	onDecision?: (accept: boolean, access: ConsentAccess) => Promise<boolean>
	signInHref?: string
}

/** What the user lets the assistant do. Matches `McpAccessLevel`. */
export type ConsentAccess = 'read' | 'write'

const ACCESS_POINTS: Record<ConsentAccess, Array<string>> = {
	write: [
		'See and edit your lists and items',
		'See lists shared with you and claim gifts on them',
		'Act as you, with exactly the access you have, but never as an admin',
	],
	read: [
		'See your lists and items, but not change them',
		'See lists shared with you, including what is already claimed, but not claim anything',
		'See what you see, and nothing an admin sees',
	],
}

const ACCESS_CHOICES: Array<{ value: ConsentAccess; label: string; hint: string }> = [
	{ value: 'write', label: 'Read and Make Changes', hint: 'It can add items, claim gifts, and edit lists when you ask.' },
	{ value: 'read', label: 'Read Only', hint: 'It can answer questions but cannot change anything.' },
]

/**
 * The OAuth consent screen shown when an AI client (Claude, Cursor,
 * ChatGPT, ...) asks to connect to this account. Presentational: the
 * route decides the state and performs the accept / deny call.
 */
export function OAuthConsentCard({
	state,
	clientName,
	accountEmail,
	error = null,
	onDecision,
	signInHref = '/sign-in',
}: OAuthConsentCardProps) {
	const [submitting, setSubmitting] = useState<'accept' | 'deny' | null>(null)
	const [access, setAccess] = useState<ConsentAccess>('write')
	const name = clientName?.trim() || 'An AI assistant'

	const decide = async (accept: boolean) => {
		if (!onDecision) return
		setSubmitting(accept ? 'accept' : 'deny')
		let handedOff = false
		try {
			handedOff = await onDecision(accept, access)
		} finally {
			// A successful decision ends in `window.location.assign`, which
			// resolves long before the navigation lands. Re-enabling the
			// buttons in that gap invites a second click on a spent code.
			if (!handedOff) setSubmitting(null)
		}
	}

	return (
		<div className="flex items-center justify-center min-h-[calc(100vh-3rem)] p-4">
			<Card className="w-full max-w-md">
				<CardHeader className="items-center text-center">
					<div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
						{state === 'disabled' || state === 'expired' ? <ShieldCheck className="size-6" /> : <Bot className="size-6" />}
					</div>
					<CardTitle className="text-2xl">{title(state, name)}</CardTitle>
					{state === 'ready' && accountEmail ? (
						<CardDescription>
							Connecting to <span className="font-medium text-foreground">{accountEmail}</span>
						</CardDescription>
					) : null}
				</CardHeader>
				<CardContent className="space-y-4">
					{state === 'loading' ? (
						<div className="flex justify-center py-6">
							<Loading className="text-primary" />
						</div>
					) : null}
					{state === 'ready' ? (
						<>
							<RadioGroup
								value={access}
								onValueChange={value => setAccess(value as ConsentAccess)}
								disabled={submitting !== null}
								aria-label="What this assistant may do"
								className="gap-2"
							>
								{ACCESS_CHOICES.map(choice => (
									<Label
										key={choice.value}
										htmlFor={`consent-access-${choice.value}`}
										className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal has-data-checked:border-primary"
									>
										<RadioGroupItem id={`consent-access-${choice.value}`} value={choice.value} className="mt-0.5" />
										<span className="space-y-0.5">
											<span className="block text-sm font-medium">{choice.label}</span>
											<span className="block text-xs text-muted-foreground">{choice.hint}</span>
										</span>
									</Label>
								))}
							</RadioGroup>
							<p className="text-sm text-muted-foreground">If you allow this, {name} will be able to:</p>
							<ul className="space-y-2 text-sm">
								{ACCESS_POINTS[access].map(point => (
									<li key={point} className="flex gap-2">
										<ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
										<span>{point}</span>
									</li>
								))}
							</ul>
							<p className="text-xs text-muted-foreground">
								You will be asked again the next time this assistant reconnects. You can change this choice or disconnect it at any time
								from Settings → Connected Apps.
							</p>
						</>
					) : null}
					{state === 'disabled' ? (
						<p className="text-sm text-muted-foreground">
							Connecting AI assistants is turned off on this GiftWrapt deployment. Ask an admin to enable the MCP server.
						</p>
					) : null}
					{state === 'expired' ? (
						<p className="text-sm text-muted-foreground">
							This request has expired or was already used. Go back to your AI assistant and start the connection again.
						</p>
					) : null}
					{state === 'declined' ? <p className="text-sm text-muted-foreground">No access was granted. You can close this window.</p> : null}
					{error ? <p className="text-sm text-destructive">{error}</p> : null}
				</CardContent>
				{state === 'ready' ? (
					<CardFooter className="flex gap-2">
						<Button variant="outline" className="flex-1" disabled={submitting !== null} onClick={() => decide(false)}>
							{submitting === 'deny' ? 'Denying...' : 'Deny'}
						</Button>
						<Button className="flex-1" disabled={submitting !== null} onClick={() => decide(true)}>
							{submitting === 'accept' ? 'Allowing...' : 'Allow'}
						</Button>
					</CardFooter>
				) : null}
				{state === 'expired' || state === 'disabled' ? (
					<CardFooter>
						<Button asChild variant="outline" className="w-full">
							<a href={signInHref}>Back to GiftWrapt</a>
						</Button>
					</CardFooter>
				) : null}
			</Card>
		</div>
	)
}

function title(state: OAuthConsentState, name: string): string {
	switch (state) {
		case 'loading':
			return 'Checking Request'
		case 'ready':
			return `Allow ${name} to Access Your Account?`
		case 'disabled':
			return 'MCP Server Is Off'
		case 'expired':
			return 'Request Expired'
		case 'declined':
			return 'Access Denied'
	}
}
