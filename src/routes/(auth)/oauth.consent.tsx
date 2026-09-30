import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

import { fetchOAuthClientInfo } from '@/api/mcp-oauth'
import { OAuthConsentCard, type OAuthConsentState } from '@/components/auth/oauth-consent-card'
import { authClient, useSession } from '@/lib/auth-client'

// The better-auth `mcp()` plugin redirects here with
// `?consent_code=&client_id=&scope=` after a signed-in user starts
// connecting an AI client (core forces `prompt=consent` on every
// authorize request; see src/server/mcp/oauth-gateway.ts). Allow / Deny
// post to `/api/auth/oauth2/consent`, which answers with the client's
// redirect URI carrying either a code or `error=access_denied`.

type Search = { consent_code?: string; client_id?: string; scope?: string }

export const Route = createFileRoute('/(auth)/oauth/consent')({
	validateSearch: (search: Record<string, unknown>): Search => {
		const out: Search = {}
		if (typeof search.consent_code === 'string') out.consent_code = search.consent_code
		if (typeof search.client_id === 'string') out.client_id = search.client_id
		if (typeof search.scope === 'string') out.scope = search.scope
		return out
	},
	component: OAuthConsentPage,
})

function OAuthConsentPage() {
	const { consent_code: consentCode, client_id: clientId } = Route.useSearch()
	const { data: session, isPending: sessionPending } = useSession()
	const [decided, setDecided] = useState<'declined' | null>(null)
	const [error, setError] = useState<string | null>(null)

	const { data: info, isPending: infoPending } = useQuery({
		queryKey: ['oauth-client-info', clientId],
		queryFn: () => fetchOAuthClientInfo({ data: { clientId: clientId ?? '' } }),
		enabled: Boolean(clientId) && Boolean(session?.user),
		staleTime: 60 * 1000,
		retry: false,
	})

	// No session: the consent endpoint would 401. Bounce through sign-in
	// with this exact URL as the post-auth target; the consent code is
	// good for ten minutes.
	if (!sessionPending && !session?.user && typeof window !== 'undefined') {
		const back = `${window.location.pathname}${window.location.search}`
		window.location.replace(`/sign-in?redirect=${encodeURIComponent(back)}`)
		return null
	}

	let state: OAuthConsentState = 'loading'
	if (decided === 'declined') state = 'declined'
	else if (!consentCode || !clientId) state = 'expired'
	else if (info && !info.enabled) state = 'disabled'
	else if (info && info.enabled && !info.client) state = 'expired'
	else if (!sessionPending && !infoPending && info) state = 'ready'

	const onDecision = async (accept: boolean) => {
		setError(null)
		const { data, error: err } = await authClient.$fetch<{ redirectURI: string }>('/oauth2/consent', {
			method: 'POST',
			body: { accept, consent_code: consentCode },
		})
		const redirectURI = (data as { redirectURI?: string } | null)?.redirectURI
		if (err || !redirectURI) {
			setError(accept ? "Couldn't complete the connection. Start again from your AI assistant." : "Couldn't record the decision.")
			return
		}
		if (!accept) setDecided('declined')
		// Hand the browser to the client's redirect URI (often a custom
		// scheme or localhost) with the code or the access_denied error.
		window.location.assign(redirectURI)
	}

	return (
		<OAuthConsentCard
			state={state}
			clientName={info?.client ? info.client.name : null}
			accountEmail={session?.user.email ?? null}
			error={error}
			onDecision={onDecision}
			signInHref="/"
		/>
	)
}
