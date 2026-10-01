// Hono app mounted at `/api/mcp` by `src/routes/api/mcp.ts`: the MCP
// server's Streamable HTTP endpoint. Same boundary discipline as the
// mobile gateway (`src/server/mobile-api/app.ts`): the route file
// dynamic-imports this module so better-auth, drizzle, and the MCP SDK
// never reach the client bundle.
//
// Stateless by design: every POST builds its own `McpServer`, handles
// exactly the JSON-RPC messages in that body, and tears down. Required
// on Vercel (each invocation is its own isolate), harmless on a
// long-running host. No sessions, no SSE resumption, no elicitation.

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { Hono } from 'hono'

import { db } from '@/db'
import { env } from '@/env'
import { createLogger } from '@/lib/logger'
import { MCP_ENDPOINT_PATH } from '@/lib/mcp-config'
import { mcpLimiter } from '@/lib/rate-limits'
import { getAppSettings } from '@/lib/settings-loader'

import { type McpAuthFailure, resolveMcpActor } from './auth'
import type { ToolContext } from './context'
import { createMcpServer } from './server'

const log = createLogger('mcp')

const authOrigin = new URL(env.BETTER_AUTH_URL || 'http://localhost:3001').origin

/** JSON-RPC shaped error body, so MCP clients can surface the message. */
function rpcError(status: number, code: number, message: string, headers: Record<string, string> = {}): Response {
	return Response.json({ jsonrpc: '2.0', error: { code, message }, id: null }, { status, headers })
}

function unauthorized(reason: McpAuthFailure): Response {
	const resourceMetadata = `${authOrigin}/.well-known/oauth-protected-resource${MCP_ENDPOINT_PATH}`
	const errorAttr = reason === 'missing-token' ? '' : `, error="invalid_token", error_description="${reason}"`
	const messages: Record<McpAuthFailure, string> = {
		'missing-token': 'Authentication required',
		'invalid-token': 'Invalid access token',
		'expired-token': 'Access token expired; refresh it',
		'client-disabled': 'This client has been disabled by an admin',
		'user-not-found': 'Account not found',
		banned: 'Account is banned',
		'child-not-allowed': 'Child accounts cannot connect AI assistants',
	}
	return rpcError(401, -32000, `Unauthorized: ${messages[reason]}`, {
		'WWW-Authenticate': `Bearer resource_metadata="${resourceMetadata}"${errorAttr}`,
	})
}

export const mcpApp = new Hono().basePath(MCP_ENDPOINT_PATH)

// Kill switch first: with `enableMcp` off nothing else runs, tokens or not.
mcpApp.use('*', async (c, next) => {
	const settings = await getAppSettings(db)
	if (!settings.enableMcp) return rpcError(503, -32000, 'MCP server is disabled on this deployment')
	c.set('settings' as never, settings as never)
	return next()
})

// CORS. Browser-based MCP clients (Claude.ai's web app among them) call
// this endpoint cross-origin, so every response carries permissive CORS
// headers and preflights are answered here. That is safe because the only
// credential is the bearer token: the session cookie is never consulted,
// so a foreign origin cannot ride an existing login. (An earlier version
// refused foreign Origins outright, which blocked exactly those clients.)
const CORS_HEADERS: Record<string, string> = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID',
	'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version',
	'Access-Control-Max-Age': '86400',
}

mcpApp.use('*', async (c, next) => {
	if (c.req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
	await next()
	for (const [k, v] of Object.entries(CORS_HEADERS)) c.res.headers.set(k, v)
})

mcpApp.post('/', async c => {
	const now = new Date()
	const auth = await resolveMcpActor(c.req.raw.headers, db, now)
	if (!auth.ok) return unauthorized(auth.reason)

	const limit = mcpLimiter.consume(`user:${auth.actor.userId}`)
	if (!limit.allowed) {
		const retryAfter = Math.max(1, Math.ceil(limit.retryAfterMs / 1000))
		return rpcError(429, -32000, 'Too many requests', { 'Retry-After': String(retryAfter) })
	}

	const settings = await getAppSettings(db)
	const reqLog = log.child({ clientId: auth.actor.clientId })
	const ctx: ToolContext = { actor: auth.actor, settings, dbx: db, log: reqLog, now }
	const server = createMcpServer(ctx)
	const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
	// The SDK reports why it is about to answer 4xx (bad protocol version,
	// unparseable body, wrong Accept) only through `onerror`; the response
	// body never reaches the runtime log. Set before `connect`, which chains
	// any existing handler rather than replacing it.
	transport.onerror = err => {
		reqLog.warn({ err, protocolVersion: c.req.header('mcp-protocol-version') ?? null }, 'mcp transport rejected request')
	}
	await server.connect(transport)
	try {
		return await transport.handleRequest(c.req.raw, {
			authInfo: {
				token: auth.token,
				clientId: auth.actor.clientId,
				scopes: auth.actor.scopes,
				expiresAt: Math.floor(auth.expiresAt.getTime() / 1000),
			},
		})
	} finally {
		await transport.close()
		await server.close()
	}
})

// No server-initiated stream and no sessions to delete in stateless mode.
mcpApp.get('/', () => rpcError(405, -32000, 'Method not allowed', { Allow: 'POST' }))
mcpApp.delete('/', () => rpcError(405, -32000, 'Method not allowed', { Allow: 'POST' }))

mcpApp.notFound(() => rpcError(404, -32000, 'Not found'))

mcpApp.onError((err, c) => {
	log.error({ err, path: c.req.path }, 'mcp request failed')
	return rpcError(500, -32603, 'Internal error')
})
