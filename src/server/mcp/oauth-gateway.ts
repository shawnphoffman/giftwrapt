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
//    plugin stores the rewritten query in its `oidc_login_prompt`
//    cookie, so the login-first path inherits the rewrite.
//
// 3. No OpenID. The same rewrite drops `openid` from the requested
//    scope (see MCP_SCOPES in src/lib/mcp-config.ts): with it granted
//    the plugin returns an ID token nobody can validate, and a strict
//    client fails the whole connection on it. Clients that asked for
//    `openid` get a narrower grant, which OAuth allows as long as the
//    token response says so (the plugin echoes the granted scope).
//
// Covered by src/server/mcp/__tests__/oauth-flow.integration.test.ts and
// disabled.integration.test.ts.

import { db } from '@/db'
import { auth } from '@/lib/auth'
import { MCP_DEFAULT_SCOPE } from '@/lib/mcp-config'
import { getAppSettings } from '@/lib/settings-loader'

const MCP_AUTH_PREFIX = '/api/auth/mcp/'
const MCP_AUTHORIZE = '/api/auth/mcp/authorize'
const MCP_CONSENT = '/api/auth/oauth2/consent'
const MCP_WELL_KNOWN_PREFIX = '/api/auth/.well-known/'

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

export async function handleAuthRequest(request: Request): Promise<Response> {
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
			request = new Request(url, request)
		}
	}
	return auth.handler(request)
}
