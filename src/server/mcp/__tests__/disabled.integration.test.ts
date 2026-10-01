// "Disabled means zero effect": with `enableMcp` off (the default), every
// surface this feature adds must be dark and ordinary auth untouched.
// The `/api/mcp` 503 case lives in the endpoint suite (slice 20b).

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { appSettings } from '@/db/schema'

import { handleDiscovery } from '../discovery'
import { handleAuthRequest, isMcpAuthPath } from '../oauth-gateway'

const BASE = 'http://localhost:3001'

async function setMcpEnabled(enabled: boolean): Promise<void> {
	await db
		.insert(appSettings)
		.values({ key: 'enableMcp', value: enabled })
		.onConflictDoUpdate({ target: appSettings.key, set: { value: enabled } })
}

describe('MCP disabled by default', () => {
	beforeEach(async () => {
		await setMcpEnabled(false)
	})
	afterEach(async () => {
		await setMcpEnabled(false)
	})

	it('classifies exactly the plugin routes as MCP auth paths', () => {
		expect(isMcpAuthPath('/api/auth/mcp/authorize')).toBe(true)
		expect(isMcpAuthPath('/api/auth/mcp/token')).toBe(true)
		expect(isMcpAuthPath('/api/auth/mcp/register')).toBe(true)
		expect(isMcpAuthPath('/api/auth/mcp/get-session')).toBe(true)
		expect(isMcpAuthPath('/api/auth/oauth2/consent')).toBe(true)
		expect(isMcpAuthPath('/api/auth/.well-known/oauth-authorization-server')).toBe(true)
		expect(isMcpAuthPath('/api/auth/sign-in/email')).toBe(false)
		expect(isMcpAuthPath('/api/auth/get-session')).toBe(false)
		expect(isMcpAuthPath('/api/auth/passkey/verify-authentication')).toBe(false)
	})

	it('discovery documents 404 while off and resolve while on', async () => {
		expect((await handleDiscovery('authorization-server')).status).toBe(404)
		expect((await handleDiscovery('protected-resource')).status).toBe(404)

		await setMcpEnabled(true)
		const as = await handleDiscovery('authorization-server')
		expect(as.status).toBe(200)
		expect(as.headers.get('access-control-allow-origin')).toBe('*')
		const asBody = (await as.json()) as Record<string, unknown>
		expect(asBody.issuer).toBe(BASE)
		expect(asBody.authorization_endpoint).toBe(`${BASE}/api/auth/mcp/authorize`)
		expect(asBody.token_endpoint).toBe(`${BASE}/api/auth/mcp/token`)
		expect(asBody.registration_endpoint).toBe(`${BASE}/api/auth/mcp/register`)
		expect(asBody.code_challenge_methods_supported).toEqual(['S256'])
		// Plain OAuth 2.1: no `openid`, and none of the OpenID endpoints the
		// plugin advertises but never serves.
		expect(asBody.scopes_supported).toEqual(['profile', 'email', 'offline_access'])
		expect(asBody).not.toHaveProperty('jwks_uri')
		expect(asBody).not.toHaveProperty('userinfo_endpoint')
		expect(asBody).not.toHaveProperty('id_token_signing_alg_values_supported')

		const pr = await handleDiscovery('protected-resource')
		expect(pr.status).toBe(200)
		const prBody = (await pr.json()) as { resource: string; authorization_servers: Array<string>; scopes_supported: Array<string> }
		expect(prBody.resource).toBe(`${BASE}/api/mcp`)
		expect(prBody.authorization_servers).toEqual([BASE])
		expect(prBody.scopes_supported).toEqual(['profile', 'email', 'offline_access'])
		expect(prBody).not.toHaveProperty('jwks_uri')
	})

	it('plugin routes 404 while off; unrelated auth routes are untouched', async () => {
		const register = await handleAuthRequest(
			new Request(`${BASE}/api/auth/mcp/register`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ redirect_uris: ['http://localhost:9/cb'], token_endpoint_auth_method: 'none' }),
			})
		)
		expect(register.status).toBe(404)
		expect(await register.json()).toEqual({ error: 'not-found' })

		const ok = await handleAuthRequest(new Request(`${BASE}/api/auth/ok`))
		expect(ok.status).toBe(200)
		const session = await handleAuthRequest(new Request(`${BASE}/api/auth/get-session`))
		expect(session.status).toBe(200)
	})
})
