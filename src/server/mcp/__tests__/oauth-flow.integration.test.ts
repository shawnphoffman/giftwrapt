// End-to-end OAuth 2.1 flow for MCP clients, driven through the same
// gateway the `/api/auth/$` route delegates to.
//
// Guards the two properties the plan calls security blockers:
//   1. authorize NEVER redirects straight to the client with a code; it
//      always lands on the consent page (core forces `prompt=consent`).
//   2. tokens carry the configured expiries and refresh works.
// Plus PKCE hardening (S256 only) and the disabled-state 404s for the
// plugin's routes.

import { createHash, randomBytes } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { appSettings, oauthAccessToken, oauthApplication, rateLimit, users } from '@/db/schema'
import { auth } from '@/lib/auth'
import { MCP_ACCESS_TOKEN_TTL_SECONDS, MCP_REFRESH_TOKEN_TTL_SECONDS } from '@/lib/mcp-config'

import { handleAuthRequest } from '../oauth-gateway'

const BASE = 'http://localhost:3001'
const REDIRECT_URI = 'http://localhost:9/callback'
const TEST_PASSWORD = 'integration-test-password'

let testEmail: string
let cookie: string
let clientId: string

async function setMcpEnabled(enabled: boolean): Promise<void> {
	await db
		.insert(appSettings)
		.values({ key: 'enableMcp', value: enabled })
		.onConflictDoUpdate({ target: appSettings.key, set: { value: enabled } })
}

function cookieHeaderFrom(res: Response): string {
	return res.headers
		.getSetCookie()
		.map(c => c.split(';')[0])
		.join('; ')
}

async function signUp(email: string): Promise<string> {
	const res = await auth.api.signUpEmail({
		body: { name: 'OAuth Flow Test', email, password: TEST_PASSWORD } as never,
		asResponse: true,
	})
	if (res.status !== 200) throw new Error(`signUpEmail failed: ${res.status} ${await res.text()}`)
	return cookieHeaderFrom(res)
}

async function registerClient(): Promise<string> {
	const res = await handleAuthRequest(
		new Request(`${BASE}/api/auth/mcp/register`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ client_name: 'Test Client', redirect_uris: [REDIRECT_URI], token_endpoint_auth_method: 'none' }),
		})
	)
	if (res.status !== 201) throw new Error(`register failed: ${res.status} ${await res.text()}`)
	const body = (await res.json()) as { client_id: string }
	return body.client_id
}

function pkce(): { verifier: string; challenge: string } {
	const verifier = randomBytes(32).toString('base64url')
	const challenge = createHash('sha256').update(verifier).digest('base64url')
	return { verifier, challenge }
}

function authorizeUrl(params: Record<string, string>): string {
	const search = new URLSearchParams({
		client_id: clientId,
		redirect_uri: REDIRECT_URI,
		response_type: 'code',
		scope: 'openid profile email offline_access',
		state: 'state-123',
		...params,
	})
	return `${BASE}/api/auth/mcp/authorize?${search.toString()}`
}

async function authorize(params: Record<string, string>, withCookie = true): Promise<Response> {
	return handleAuthRequest(new Request(authorizeUrl(params), { headers: withCookie ? { cookie } : {}, redirect: 'manual' }))
}

async function consent(consentCode: string, accept: boolean): Promise<{ redirectURI: string }> {
	const res = await handleAuthRequest(
		new Request(`${BASE}/api/auth/oauth2/consent`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie },
			body: JSON.stringify({ accept, consent_code: consentCode }),
		})
	)
	if (res.status !== 200) throw new Error(`consent failed: ${res.status} ${await res.text()}`)
	return (await res.json()) as { redirectURI: string }
}

async function token(body: Record<string, string>): Promise<Response> {
	return handleAuthRequest(
		new Request(`${BASE}/api/auth/mcp/token`, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams(body).toString(),
		})
	)
}

type TokenResponse = {
	access_token: string
	refresh_token: string
	expires_in: number
	token_type: string
	scope: string
	id_token?: string
}

/** Runs authorize → consent → token and returns the token response. */
async function obtainTokens(): Promise<TokenResponse> {
	const { verifier, challenge } = pkce()
	const authRes = await authorize({ code_challenge: challenge, code_challenge_method: 'S256' })
	expect(authRes.status).toBe(302)
	const location = new URL(authRes.headers.get('location')!, BASE)
	expect(location.pathname).toBe('/oauth/consent')
	const consentCode = location.searchParams.get('consent_code')!
	const { redirectURI } = await consent(consentCode, true)
	const cb = new URL(redirectURI)
	expect(cb.origin + cb.pathname).toBe(REDIRECT_URI)
	const code = cb.searchParams.get('code')!
	expect(cb.searchParams.get('state')).toBe('state-123')
	const tokenRes = await token({
		grant_type: 'authorization_code',
		code,
		redirect_uri: REDIRECT_URI,
		client_id: clientId,
		code_verifier: verifier,
	})
	expect(tokenRes.status).toBe(200)
	const tokens = (await tokenRes.json()) as TokenResponse
	// The client asked for `openid`; the gateway narrows the grant so the
	// plugin never mints its unverifiable ID token (see MCP_SCOPES).
	expect(tokens.scope).toBe('profile email offline_access')
	expect(tokens.id_token).toBeUndefined()
	return tokens
}

describe('MCP OAuth flow', () => {
	beforeEach(async () => {
		testEmail = `oauth-flow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`
		// better-auth's DB-backed limiter caps /mcp/register at 5 per minute
		// (see `rateLimit.customRules` in src/lib/auth.ts); every test
		// registers a client, so reset the counters between tests.
		await db.delete(rateLimit)
		await setMcpEnabled(true)
		cookie = await signUp(testEmail)
		clientId = await registerClient()
	})

	afterEach(async () => {
		await db.delete(oauthApplication).where(eq(oauthApplication.clientId, clientId))
		const me = await db.query.users.findFirst({ where: (u, { eq: ueq }) => ueq(u.email, testEmail), columns: { id: true } })
		if (me) await db.delete(users).where(eq(users.id, me.id))
		await setMcpEnabled(false)
	})

	it('authorize always lands on the consent page, never straight on the client', async () => {
		const { challenge } = pkce()
		// Even a client that deliberately omits `prompt` gets consent.
		const res = await authorize({ code_challenge: challenge, code_challenge_method: 'S256' })
		expect(res.status).toBe(302)
		const location = new URL(res.headers.get('location')!, BASE)
		expect(location.pathname).toBe('/oauth/consent')
		expect(location.searchParams.get('client_id')).toBe(clientId)
		expect(location.searchParams.get('consent_code')).toBeTruthy()
		expect(location.origin).toBe(BASE)
	})

	it('redirects unauthenticated users to sign-in with the authorize query preserved', async () => {
		const { challenge } = pkce()
		const res = await authorize({ code_challenge: challenge, code_challenge_method: 'S256' }, false)
		expect(res.status).toBe(302)
		const location = new URL(res.headers.get('location')!, BASE)
		expect(location.pathname).toBe('/sign-in')
		expect(location.searchParams.get('client_id')).toBe(clientId)
		expect(location.searchParams.get('redirect_uri')).toBe(REDIRECT_URI)
		expect(location.searchParams.get('prompt')).toBe('consent')
	})

	it('issues tokens with the configured lifetimes after consent', async () => {
		const tokens = await obtainTokens()
		expect(tokens.token_type.toLowerCase()).toBe('bearer')
		expect(tokens.expires_in).toBe(MCP_ACCESS_TOKEN_TTL_SECONDS)
		expect(tokens.refresh_token).toBeTruthy()

		const row = await db.query.oauthAccessToken.findFirst({ where: (t, { eq: teq }) => teq(t.accessToken, tokens.access_token) })
		expect(row).toBeTruthy()
		const accessTtl = row!.accessTokenExpiresAt.getTime() - Date.now()
		expect(accessTtl).toBeGreaterThan((MCP_ACCESS_TOKEN_TTL_SECONDS - 60) * 1000)
		expect(accessTtl).toBeLessThanOrEqual(MCP_ACCESS_TOKEN_TTL_SECONDS * 1000)
		const refreshTtl = row!.refreshTokenExpiresAt!.getTime() - Date.now()
		expect(refreshTtl).toBeGreaterThan((MCP_REFRESH_TOKEN_TTL_SECONDS - 60) * 1000)

		const session = await auth.api.getMcpSession({ headers: new Headers({ authorization: `Bearer ${tokens.access_token}` }) })
		expect(session?.clientId).toBe(clientId)
	})

	it('refresh_token grant issues a new access token', async () => {
		const first = await obtainTokens()
		const res = await token({ grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: clientId })
		expect(res.status).toBe(200)
		const second = (await res.json()) as TokenResponse
		expect(second.access_token).toBeTruthy()
		expect(second.access_token).not.toBe(first.access_token)
	})

	it('deny returns the client an access_denied error and no code', async () => {
		const { challenge } = pkce()
		const authRes = await authorize({ code_challenge: challenge, code_challenge_method: 'S256' })
		const consentCode = new URL(authRes.headers.get('location')!, BASE).searchParams.get('consent_code')!
		const { redirectURI } = await consent(consentCode, false)
		const cb = new URL(redirectURI)
		expect(cb.searchParams.get('error')).toBe('access_denied')
		expect(cb.searchParams.get('code')).toBeNull()
	})

	it('rejects the plain code_challenge_method and a missing PKCE challenge', async () => {
		const plain = await authorize({ code_challenge: 'abc', code_challenge_method: 'plain' })
		expect(plain.status).toBe(302)
		const plainLoc = new URL(plain.headers.get('location')!)
		expect(plainLoc.origin + plainLoc.pathname).toBe(REDIRECT_URI)
		expect(plainLoc.searchParams.get('error')).toBe('invalid_request')

		const none = await authorize({})
		expect(none.status).toBe(302)
		const noneLoc = new URL(none.headers.get('location')!)
		expect(noneLoc.searchParams.get('error')).toBe('invalid_request')
	})

	it('a wrong code_verifier is refused at the token endpoint', async () => {
		const { challenge } = pkce()
		const authRes = await authorize({ code_challenge: challenge, code_challenge_method: 'S256' })
		const consentCode = new URL(authRes.headers.get('location')!, BASE).searchParams.get('consent_code')!
		const { redirectURI } = await consent(consentCode, true)
		const code = new URL(redirectURI).searchParams.get('code')!
		const res = await token({
			grant_type: 'authorization_code',
			code,
			redirect_uri: REDIRECT_URI,
			client_id: clientId,
			code_verifier: 'not-the-verifier',
		})
		expect(res.status).toBeGreaterThanOrEqual(400)
		const rows = await db.select({ id: oauthAccessToken.id }).from(oauthAccessToken).where(eq(oauthAccessToken.clientId, clientId))
		expect(rows).toHaveLength(0)
	})

	it('rate-limits client registration to 5 per minute per IP', async () => {
		// One registration already happened in beforeEach.
		for (let i = 0; i < 4; i++) await registerClient()
		const res = await handleAuthRequest(
			new Request(`${BASE}/api/auth/mcp/register`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ redirect_uris: [REDIRECT_URI], token_endpoint_auth_method: 'none' }),
			})
		)
		expect(res.status).toBe(429)
		await db.delete(oauthApplication).where(eq(oauthApplication.name, 'Test Client'))
	})

	it('every plugin route 404s once enableMcp is switched off', async () => {
		const tokens = await obtainTokens()
		await setMcpEnabled(false)

		const { challenge } = pkce()
		expect((await authorize({ code_challenge: challenge, code_challenge_method: 'S256' })).status).toBe(404)
		expect((await token({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: clientId })).status).toBe(404)
		const reg = await handleAuthRequest(
			new Request(`${BASE}/api/auth/mcp/register`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ redirect_uris: [REDIRECT_URI], token_endpoint_auth_method: 'none' }),
			})
		)
		expect(reg.status).toBe(404)
		const consentRes = await handleAuthRequest(
			new Request(`${BASE}/api/auth/oauth2/consent`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie },
				body: JSON.stringify({ accept: true, consent_code: 'x' }),
			})
		)
		expect(consentRes.status).toBe(404)
		const wk = await handleAuthRequest(new Request(`${BASE}/api/auth/.well-known/oauth-authorization-server`))
		expect(wk.status).toBe(404)

		// Ordinary auth still works while the switch is off.
		const session = await handleAuthRequest(new Request(`${BASE}/api/auth/get-session`, { headers: { cookie } }))
		expect(session.status).toBe(200)
	})
})
