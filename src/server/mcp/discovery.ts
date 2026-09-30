// OAuth discovery documents served at the deployment origin.
//
// MCP clients resolve the authorization server from the root well-known
// URLs (RFC 8414 / RFC 9728), not from `/api/auth/.well-known/*`, which
// is where better-auth mounts them. These handlers proxy the plugin's
// own metadata builders so the two never drift, and go dark with the
// `enableMcp` switch so a disabled deployment gives clients a clean 404
// instead of a tantalizing 401 loop.

import { auth } from '@/lib/auth'

import { isMcpEnabled, mcpDisabledResponse } from './oauth-gateway'

export type DiscoveryDocument = 'authorization-server' | 'protected-resource'

export async function handleDiscovery(kind: DiscoveryDocument): Promise<Response> {
	if (!(await isMcpEnabled())) return mcpDisabledResponse()
	const body = kind === 'authorization-server' ? await auth.api.getMcpOAuthConfig() : await auth.api.getMCPProtectedResource()
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
