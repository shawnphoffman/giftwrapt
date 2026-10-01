// Shared seeding for the MCP suites: a registered OAuth client and an
// access token for a user, written straight to the plugin's tables. The
// full OAuth dance is covered by oauth-flow.integration.test.ts; these
// suites care about what happens once a token exists.

import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { appSettings, oauthAccessToken, oauthApplication } from '@/db/schema'
import { MCP_ACCESS_TOKEN_TTL_SECONDS, MCP_REFRESH_TOKEN_TTL_SECONDS } from '@/lib/mcp-config'

let seq = 0
function nextId(prefix: string): string {
	seq += 1
	return `${prefix}_${Date.now().toString(36)}_${seq}`
}

export async function setMcpEnabled(enabled: boolean): Promise<void> {
	await db
		.insert(appSettings)
		.values({ key: 'enableMcp', value: enabled })
		.onConflictDoUpdate({ target: appSettings.key, set: { value: enabled } })
}

export async function seedClient(overrides: { name?: string; disabled?: boolean } = {}): Promise<{ id: string; clientId: string }> {
	const id = nextId('app')
	const clientId = nextId('cid')
	await db.insert(oauthApplication).values({
		id,
		name: overrides.name ?? 'Test Client',
		clientId,
		redirectUrls: 'http://localhost:9/cb',
		type: 'public',
		disabled: overrides.disabled ?? false,
	})
	return { id, clientId }
}

export async function seedToken(args: {
	userId: string
	clientId: string
	expired?: boolean
	now?: Date
}): Promise<{ id: string; accessToken: string }> {
	const now = args.now ?? new Date()
	const id = nextId('tok')
	const accessToken = nextId('at')
	const accessTtlMs = MCP_ACCESS_TOKEN_TTL_SECONDS * 1000
	await db.insert(oauthAccessToken).values({
		id,
		accessToken,
		refreshToken: nextId('rt'),
		accessTokenExpiresAt: new Date(now.getTime() + (args.expired ? -accessTtlMs : accessTtlMs)),
		refreshTokenExpiresAt: new Date(now.getTime() + MCP_REFRESH_TOKEN_TTL_SECONDS * 1000),
		clientId: args.clientId,
		userId: args.userId,
		scopes: 'openid profile email offline_access',
	})
	return { id, accessToken }
}

export async function deleteClient(clientId: string): Promise<void> {
	await db.delete(oauthApplication).where(eq(oauthApplication.clientId, clientId))
}

/** A JSON-RPC request body for the Streamable HTTP endpoint. */
export function rpc(method: string, params: Record<string, unknown> = {}, id = 1): string {
	return JSON.stringify({ jsonrpc: '2.0', id, method, params })
}

export const INITIALIZE_PARAMS = {
	protocolVersion: '2025-06-18',
	capabilities: {},
	clientInfo: { name: 'integration-test', version: '0' },
}

export function mcpRequest(body: string, token: string | null, extraHeaders: Record<string, string> = {}): Request {
	return new Request('http://localhost:3001/api/mcp', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'application/json, text/event-stream',
			...(token ? { authorization: `Bearer ${token}` } : {}),
			...extraHeaders,
		},
		body,
	})
}
