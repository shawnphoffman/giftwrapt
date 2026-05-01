import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

import { getOidcClientPublicInfo } from '@/api/oidc'
import { type OAuthConsentClient, OAuthConsentPageContent } from '@/components/auth/oauth-consent-page'
import { authClient } from '@/lib/auth-client'
import { authMiddleware } from '@/middleware/auth'

type Search = {
	consent_code?: string
	client_id?: string
	scope?: string
}

const fetchClient = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.inputValidator((data: { clientId: string }) => data)
	.handler(async ({ data }) => getOidcClientPublicInfo({ data: { clientId: data.clientId } }))

export const Route = createFileRoute('/(core)/oauth/consent')({
	validateSearch: (search: Record<string, unknown>): Search => {
		const out: Search = {}
		if (typeof search.consent_code === 'string') out.consent_code = search.consent_code
		if (typeof search.client_id === 'string') out.client_id = search.client_id
		if (typeof search.scope === 'string') out.scope = search.scope
		return out
	},
	loader: async ({ location }) => {
		// `location.search` is already typed via validateSearch on the
		// route. better-auth's authorize.mjs always puts the consent
		// flow params on the query string when consentPage is set, so
		// these are reliable.
		const params = location.search as Search
		if (!params.client_id) return { client: null, scopes: [] as Array<string> }
		const client = await fetchClient({ data: { clientId: params.client_id } })
		const scopes = (params.scope ?? '')
			.split(/\s+/)
			.map(s => s.trim())
			.filter(Boolean)
		return { client, scopes }
	},
	component: OAuthConsentRoute,
})

function OAuthConsentRoute() {
	const { client, scopes } = Route.useLoaderData()
	const { consent_code } = Route.useSearch()

	const cast = (c: typeof client): OAuthConsentClient | null => (c ? { clientId: c.clientId, name: c.name, icon: c.icon } : null)

	const submit = async (accept: boolean): Promise<void> => {
		// `authClient.oauth2.consent` is the path-to-object mapping for
		// /oauth2/consent. Better-auth returns `{ redirectURI }` on
		// success — accept and deny both terminate at the OIDC client's
		// redirect URI (with `?code=…` on accept and `?error=…` on
		// deny), so the redirect handling is identical.
		const fn = (
			authClient as unknown as {
				oauth2: {
					consent: (args: {
						accept: boolean
						consent_code?: string
					}) => Promise<{ data: { redirectURI?: string } | null; error: { message?: string } | null }>
				}
			}
		).oauth2.consent
		const { data, error } = await fn({ accept, consent_code })
		if (error) throw new Error(error.message ?? 'consent failed')
		if (data?.redirectURI) window.location.assign(data.redirectURI)
	}

	return (
		<OAuthConsentPageContent
			client={cast(client)}
			scopes={scopes}
			onApprove={() => submit(true)}
			onDeny={() => submit(false)}
			signInHref="/"
		/>
	)
}
