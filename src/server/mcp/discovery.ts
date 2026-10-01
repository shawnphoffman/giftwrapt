// OAuth discovery documents served at the deployment origin.
//
// MCP clients resolve the authorization server from the root well-known
// URLs (RFC 8414 / RFC 9728), not from `/api/auth/.well-known/*`, which
// is where better-auth mounts them. These handlers take the endpoint
// URLs from the plugin's own metadata builders so the two never drift,
// and go dark with the `enableMcp` switch so a disabled deployment gives
// clients a clean 404 instead of a tantalizing 401 loop.
//
// The plugin's documents are OpenID-shaped: they advertise `openid`, a
// `jwks_uri` and a `userinfo_endpoint` that the plugin never serves, and
// RS256 ID tokens it does not mint (its ID token is HS256 with a
// throwaway key). We publish only what we actually offer, which is the
// RFC 8414 / RFC 9728 set an MCP client needs. See MCP_SCOPES.

import { auth } from '@/lib/auth'
import { MCP_SCOPES } from '@/lib/mcp-config'

import { isMcpEnabled, mcpDisabledResponse } from './oauth-gateway'

export type DiscoveryDocument = 'authorization-server' | 'protected-resource'

export async function handleDiscovery(kind: DiscoveryDocument): Promise<Response> {
	if (!(await isMcpEnabled())) return mcpDisabledResponse()
	const body = kind === 'authorization-server' ? await authorizationServerDocument() : await protectedResourceDocument()
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization',
			'Cache-Control': 'public, max-age=300',
		},
	})
}

async function authorizationServerDocument(): Promise<Record<string, unknown>> {
	const plugin = await auth.api.getMcpOAuthConfig()
	// Null only when the plugin cannot resolve its own base URL, which the
	// boot-time BETTER_AUTH_URL check already rules out.
	if (!plugin) throw new Error('mcp plugin metadata unavailable')
	return {
		issuer: plugin.issuer,
		authorization_endpoint: plugin.authorization_endpoint,
		token_endpoint: plugin.token_endpoint,
		registration_endpoint: plugin.registration_endpoint,
		scopes_supported: [...MCP_SCOPES],
		response_types_supported: plugin.response_types_supported,
		response_modes_supported: plugin.response_modes_supported,
		grant_types_supported: plugin.grant_types_supported,
		token_endpoint_auth_methods_supported: plugin.token_endpoint_auth_methods_supported,
		code_challenge_methods_supported: plugin.code_challenge_methods_supported,
	}
}

async function protectedResourceDocument(): Promise<Record<string, unknown>> {
	const plugin = await auth.api.getMCPProtectedResource()
	return {
		resource: plugin.resource,
		authorization_servers: plugin.authorization_servers,
		scopes_supported: [...MCP_SCOPES],
		bearer_methods_supported: plugin.bearer_methods_supported,
	}
}
