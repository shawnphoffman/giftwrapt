import { Bot, ShieldCheck } from 'lucide-react'
import { useState } from 'react'

import { RichMessage } from '@/components/common/rich-message'
import Loading from '@/components/loading'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { m } from '@/paraglide/messages.js'

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

// Functions, not tables: the text has to be in the language of the page that
// is rendering, which a module-level constant cannot know.
function accessPoints(access: ConsentAccess): Array<string> {
	if (access === 'write') {
		return [m.auth_consent_write_point_edit(), m.auth_consent_write_point_shared(), m.auth_consent_write_point_identity()]
	}
	return [m.auth_consent_read_point_view(), m.auth_consent_read_point_shared(), m.auth_consent_read_point_identity()]
}

function accessChoices(): Array<{ value: ConsentAccess; label: string; hint: string }> {
	return [
		{ value: 'write', label: m.auth_consent_choice_write_label(), hint: m.auth_consent_choice_write_hint() },
		{ value: 'read', label: m.auth_consent_choice_read_label(), hint: m.auth_consent_choice_read_hint() },
	]
}

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
	const name = clientName?.trim() || null

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
							<RichMessage
								parts={m.auth_consent_connecting_to.parts({ email: accountEmail })}
								tags={{ strong: children => <span className="font-medium text-foreground">{children}</span> }}
							/>
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
								aria-label={m.auth_consent_access_label()}
								className="gap-2"
							>
								{accessChoices().map(choice => (
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
							<p className="text-sm text-muted-foreground">
								{name ? m.auth_consent_points_intro({ name }) : m.auth_consent_points_intro_unnamed()}
							</p>
							<ul className="space-y-2 text-sm">
								{accessPoints(access).map(point => (
									<li key={point} className="flex gap-2">
										<ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
										<span>{point}</span>
									</li>
								))}
							</ul>
							<p className="text-xs text-muted-foreground">{m.auth_consent_footnote()}</p>
						</>
					) : null}
					{state === 'disabled' ? <p className="text-sm text-muted-foreground">{m.auth_consent_disabled_body()}</p> : null}
					{state === 'expired' ? <p className="text-sm text-muted-foreground">{m.auth_consent_expired_body()}</p> : null}
					{state === 'declined' ? <p className="text-sm text-muted-foreground">{m.auth_consent_declined_body()}</p> : null}
					{error ? <p className="text-sm text-destructive">{error}</p> : null}
				</CardContent>
				{state === 'ready' ? (
					<CardFooter className="flex gap-2">
						<Button variant="outline" className="flex-1" disabled={submitting !== null} onClick={() => decide(false)}>
							{submitting === 'deny' ? m.auth_consent_denying() : m.auth_consent_deny()}
						</Button>
						<Button className="flex-1" disabled={submitting !== null} onClick={() => decide(true)}>
							{submitting === 'accept' ? m.auth_consent_allowing() : m.auth_consent_allow()}
						</Button>
					</CardFooter>
				) : null}
				{state === 'expired' || state === 'disabled' ? (
					<CardFooter>
						<Button asChild variant="outline" className="w-full">
							<a href={signInHref}>{m.auth_consent_back()}</a>
						</Button>
					</CardFooter>
				) : null}
			</Card>
		</div>
	)
}

function title(state: OAuthConsentState, name: string | null): string {
	switch (state) {
		case 'loading':
			return m.auth_consent_title_loading()
		case 'ready':
			return name ? m.auth_consent_title_ready({ name }) : m.auth_consent_title_ready_unnamed()
		case 'disabled':
			return m.auth_consent_title_disabled()
		case 'expired':
			return m.auth_consent_title_expired()
		case 'declined':
			return m.auth_consent_title_declined()
	}
}
