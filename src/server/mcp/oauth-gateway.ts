// Wraps `auth.handler` for the better-auth `mcp()` plugin's routes.
//
// Two jobs, both security-relevant:
//
// 1. Kill switch. The plugin registers its endpoints once at boot, so
//    the only way for the admin `enableMcp` toggle to disable client
//    registration, authorize, token, refresh, and consent is to refuse
//    them here before better-auth sees the request.
//
// 2. Forced consent. The plugin's authorize path hands a code straight
//    to `redirect_uri` unless the client sent `prompt=consent`
//    (node_modules/better-auth/dist/plugins/mcp/authorize.mjs). With
//    unauthenticated dynamic registration that is a one-link account
//    takeover: register a client, send a signed-in user the authorize
//    link, collect the code. We rewrite every authorize request to
//    `prompt=consent` so the user always sees the consent page. The
//    sign-in redirect the plugin issues carries the rewritten query, so
//    the sign-in-first path inherits the rewrite through the URL.
//
// 3. No OpenID. The same rewrite drops `openid` from the requested
//    scope (see MCP_SCOPES in src/lib/mcp-config.ts): with it granted
//    the plugin returns an ID token nobody can validate, and a strict
//    client fails the whole connection on it. Clients that asked for
//    `openid` get a narrower grant, which OAuth allows as long as the
//    token response says so (the plugin echoes the granted scope).
//
// 4. No login replay. When authorize finds no session the plugin also
//    stores the query in a signed `oidc_login_prompt` cookie, and an
//    after-hook on every endpoint replays authorize as soon as a response
//    sets a session cookie (node_modules/better-auth/dist/plugins/mcp/
//    index.mjs). That replay answers the sign-in POST with its own 302,
//    which the browser's fetch follows into page HTML, and the 302 does
//    not carry the session cookie the sign-in just minted, so the user is
//    left signed out on the sign-in form (2026-11-07). Core has its own
//    way back: the sign-in page keeps the authorize query and revisits
//    /api/auth/mcp/authorize once a session exists (src/lib/oauth-relay.ts).
//    So the gateway never lets the cookie reach the browser and drops one
//    that arrives anyway, before better-auth sees the request.
//
// 5. Reconnecting clients. Registrations used to be swept after 30 idle
//    days (src/lib/cron/cleanup-oauth.ts), and the clients that held them
//    (ChatGPT's workspace app, Claude Code) keep their client_id for good
//    and never register again, so every reconnect died at authorize with
//    `invalid_client` and a bounce to `/` (2026-11-07). An authorize
//    request from a signed-in user for a client_id core does not know
//    re-creates the registration from the request: a public client (PKCE,
//    which core requires anyway) with that one redirect_uri, named after
//    the redirect host. That is the trust dynamic registration already
//    extends to anyone, the consent screen still gates every grant, and
//    the row is swept again unless someone approves it. Disabling a
//    client is how an admin refuses one; deleting only removes the row.
//
// Covered by src/server/mcp/__tests__/oauth-flow.integration.test.ts and
// disabled.integration.test.ts.

import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { oauthApplication } from '@/db/schema'
import { auth } from '@/lib/auth'
import { createLogger } from '@/lib/logger'
import { MCP_DEFAULT_SCOPE } from '@/lib/mcp-config'
import { mcpClientRestoreLimiter } from '@/lib/rate-limits'
import { getAppSettings } from '@/lib/settings-loader'

const log = createLogger('mcp:oauth-gateway')

const MCP_AUTH_PREFIX = '/api/auth/mcp/'
const MCP_AUTHORIZE = '/api/auth/mcp/authorize'
const MCP_CONSENT = '/api/auth/oauth2/consent'
const MCP_WELL_KNOWN_PREFIX = '/api/auth/.well-known/'
const LOGIN_PROMPT_COOKIE = 'oidc_login_prompt'
/** What the plugin mints and what clients echo back: short and URL-safe. */
const CLIENT_ID_SHAPE = /^[A-Za-z0-9._~-]{8,128}$/

/** Every better-auth route that exists only because of the `mcp()` plugin. */
export function isMcpAuthPath(pathname: string): boolean {
	return pathname.startsWith(MCP_AUTH_PREFIX) || pathname === MCP_CONSENT || pathname.startsWith(MCP_WELL_KNOWN_PREFIX)
}

export function mcpDisabledResponse(): Response {
	return Response.json({ error: 'not-found' }, { status: 404 })
}

/** The scope the plugin will be asked to grant for a client's requested scope. */
export function grantableScope(requested: string | null): string {
	const kept = (requested ?? '').split(' ').filter(s => s.length > 0 && s !== 'openid')
	return kept.length > 0 ? kept.join(' ') : MCP_DEFAULT_SCOPE
}

export async function isMcpEnabled(): Promise<boolean> {
	const settings = await getAppSettings(db)
	return settings.enableMcp
}

const CORS_PREFLIGHT_HEADERS: Record<string, string> = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
	'Access-Control-Max-Age': '86400',
}

function isLoginPromptCookie(entry: string): boolean {
	return entry.startsWith(`${LOGIN_PROMPT_COOKIE}=`)
}

/** The request without the plugin's login-prompt cookie, so its after-hook never replays authorize. */
export function withoutLoginPromptCookie(request: Request): Request {
	const raw = request.headers.get('cookie')
	if (!raw || !raw.includes(`${LOGIN_PROMPT_COOKIE}=`)) return request
	const kept = raw
		.split(';')
		.map(part => part.trim())
		.filter(part => part.length > 0 && !isLoginPromptCookie(part))
	const headers = new Headers(request.headers)
	if (kept.length > 0) headers.set('cookie', kept.join('; '))
	else headers.delete('cookie')
	// Rebuild from the URL rather than from `request`: the dev server's
	// request is not an undici `Request`, and undici's constructor crashes
	// on a foreign one passed as `input`. A streamed body needs `duplex`.
	return new Request(request.url, { method: request.method, headers, body: request.body, duplex: 'half' } as RequestInit)
}

/** The response without any `Set-Cookie` for the plugin's login-prompt cookie. */
export function withoutLoginPromptSetCookie(response: Response): Response {
	const cookies = response.headers.getSetCookie()
	if (!cookies.some(isLoginPromptCookie)) return response
	const headers = new Headers(response.headers)
	headers.delete('set-cookie')
	for (const entry of cookies) if (!isLoginPromptCookie(entry)) headers.append('set-cookie', entry)
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export type RestoreOutcome = 'restored' | 'known' | 'skipped' | 'rate-limited'

/**
 * Re-creates the registration for a client_id core no longer knows from
 * the authorize request itself (point 5 above). Only for a signed-in
 * user, so an anonymous probe cannot fill the table, and a few per user
 * per minute. The plugin then finds the client and carries on to consent.
 */
export async function restoreUnknownClient(params: URLSearchParams, headers: Headers): Promise<RestoreOutcome> {
	const clientId = params.get('client_id')
	const redirectUri = params.get('redirect_uri')
	if (!clientId || !redirectUri || !CLIENT_ID_SHAPE.test(clientId)) return 'skipped'
	let host: string
	try {
		const parsed = new URL(redirectUri)
		host = parsed.host || parsed.protocol.replace(/:$/, '')
	} catch {
		return 'skipped'
	}
	const known = await db.select({ id: oauthApplication.id }).from(oauthApplication).where(eq(oauthApplication.clientId, clientId)).limit(1)
	if (known.length > 0) return 'known'
	const session = await auth.api.getSession({ headers })
	if (!session) return 'skipped'
	const limit = await mcpClientRestoreLimiter.consume(`user:${session.user.id}`)
	if (!limit.allowed) return 'rate-limited'
	const now = new Date()
	const inserted = await db
		.insert(oauthApplication)
		.values({
			id: randomUUID(),
			name: host,
			clientId,
			clientSecret: '',
			redirectUrls: redirectUri,
			type: 'public',
			authenticationScheme: 'none',
			disabled: false,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing({ target: oauthApplication.clientId })
		.returning({ id: oauthApplication.id })
	if (inserted.length === 0) return 'known'
	log.warn({ clientId, redirectUri, userId: session.user.id }, 'mcp client registration re-created from authorize')
	return 'restored'
}

export async function handleAuthRequest(incoming: Request): Promise<Response> {
	let request = withoutLoginPromptCookie(incoming)
	const url = new URL(request.url)
	if (isMcpAuthPath(url.pathname)) {
		if (!(await isMcpEnabled())) return mcpDisabledResponse()
		// Browser-based MCP clients preflight the register and token calls;
		// the plugin sets CORS headers on its responses but nothing answers
		// OPTIONS, so do it here.
		if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_PREFLIGHT_HEADERS })
		if (url.pathname === MCP_AUTHORIZE) {
			url.searchParams.set('prompt', 'consent')
			url.searchParams.set('scope', grantableScope(url.searchParams.get('scope')))
			await restoreUnknownClient(url.searchParams, request.headers)
			request = new Request(url, request)
		}
	}
	return withoutLoginPromptSetCookie(await auth.handler(request))
}
