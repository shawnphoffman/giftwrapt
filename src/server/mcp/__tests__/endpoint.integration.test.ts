// The `/api/mcp` endpoint: kill switch, origin check, the auth guard's
// every refusal, method handling, and a real JSON-RPC round trip.

import { makeUser } from '@test/integration/factories'
import { eq } from 'drizzle-orm'
import type { Logger } from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setMcpClientAccessImpl } from '@/api/_mcp-admin-impl'
import { db } from '@/db'
import { lists, oauthApplication, users } from '@/db/schema'
import type * as loggerModule from '@/lib/logger'
import { createDbRateLimiter } from '@/lib/rate-limit-db'
import { mcpLimiter } from '@/lib/rate-limits'

import { mcpApp } from '../app'
import { deleteClient, INITIALIZE_PARAMS, mcpRequest, rpc, seedClient, seedToken, setMcpEnabled } from './helpers'

// Every per-request child of the endpoint's `mcp` logger, with `warn`
// spied, so a test can assert on what the transport logged.
const mcpChildLogs = vi.hoisted(() => [] as Array<Logger<string>>)

vi.mock('@/lib/logger', async importOriginal => {
	const actual = await importOriginal<typeof loggerModule>()
	return {
		...actual,
		createLogger: (scope: string, bindings?: Record<string, unknown>) => {
			const log = actual.createLogger(scope, bindings)
			if (scope !== 'mcp') return log
			const child = log.child.bind(log)
			log.child = ((...args: Parameters<Logger['child']>) => {
				const c = child(...args)
				vi.spyOn(c, 'warn')
				mcpChildLogs.push(c)
				return c
			}) as Logger['child']
			return log
		},
	}
})

let userId: string
let clientId: string
let token: string

async function call(body: string, bearer: string | null, headers: Record<string, string> = {}): Promise<Response> {
	return mcpApp.fetch(mcpRequest(body, bearer, headers))
}

describe('/api/mcp endpoint', () => {
	beforeEach(async () => {
		await mcpLimiter._resetForTesting()
		await setMcpEnabled(true)
		const user = await makeUser(db, { name: 'Endpoint User' })
		userId = user.id
		const client = await seedClient()
		clientId = client.clientId
		token = (await seedToken({ userId, clientId })).accessToken
	})

	afterEach(async () => {
		await deleteClient(clientId)
		await db.delete(users).where(eq(users.id, userId))
		await setMcpEnabled(false)
	})

	it('returns 503 for everything while enableMcp is off, even with a valid token', async () => {
		await setMcpEnabled(false)
		const res = await call(rpc('initialize', INITIALIZE_PARAMS), token)
		expect(res.status).toBe(503)
		const body = (await res.json()) as { error: { message: string } }
		expect(body.error.message).toMatch(/disabled/i)
	})

	it('401 with WWW-Authenticate resource metadata when the token is missing', async () => {
		const res = await call(rpc('initialize', INITIALIZE_PARAMS), null)
		expect(res.status).toBe(401)
		expect(res.headers.get('www-authenticate')).toBe(
			'Bearer resource_metadata="http://localhost:3001/.well-known/oauth-protected-resource/api/mcp"'
		)
	})

	it('401 for an unknown token', async () => {
		const res = await call(rpc('initialize', INITIALIZE_PARAMS), 'not-a-token')
		expect(res.status).toBe(401)
		expect(res.headers.get('www-authenticate')).toContain('error="invalid_token"')
	})

	it('401 for an expired token', async () => {
		const expired = await seedToken({ userId, clientId, expired: true })
		const res = await call(rpc('initialize', INITIALIZE_PARAMS), expired.accessToken)
		expect(res.status).toBe(401)
		expect(res.headers.get('www-authenticate')).toContain('expired-token')
	})

	it('401 once the client is disabled', async () => {
		const disabled = await seedClient({ disabled: true })
		const t = await seedToken({ userId, clientId: disabled.clientId })
		try {
			const res = await call(rpc('initialize', INITIALIZE_PARAMS), t.accessToken)
			expect(res.status).toBe(401)
			expect(res.headers.get('www-authenticate')).toContain('client-disabled')
		} finally {
			await deleteClient(disabled.clientId)
		}
	})

	it('401 for banned users and for child accounts', async () => {
		await db.update(users).set({ banned: true }).where(eq(users.id, userId))
		const banned = await call(rpc('initialize', INITIALIZE_PARAMS), token)
		expect(banned.status).toBe(401)
		expect(banned.headers.get('www-authenticate')).toContain('banned')

		await db.update(users).set({ banned: false, role: 'child' }).where(eq(users.id, userId))
		const child = await call(rpc('initialize', INITIALIZE_PARAMS), token)
		expect(child.status).toBe(401)
		expect(child.headers.get('www-authenticate')).toContain('child-not-allowed')
	})

	it('401 when the token row is deleted (revocation)', async () => {
		const { oauthAccessToken } = await import('@/db/schema')
		await db.delete(oauthAccessToken).where(eq(oauthAccessToken.accessToken, token))
		const res = await call(rpc('initialize', INITIALIZE_PARAMS), token)
		expect(res.status).toBe(401)
	})

	it('accepts a case-insensitive Bearer scheme', async () => {
		const res = await call(rpc('initialize', INITIALIZE_PARAMS), null, { authorization: `bearer ${token}` })
		expect(res.status).toBe(200)
	})

	it('answers CORS preflights and allows browser clients from any origin', async () => {
		const preflight = await mcpApp.fetch(
			new Request('http://localhost:3001/api/mcp', {
				method: 'OPTIONS',
				headers: {
					origin: 'https://claude.ai',
					'access-control-request-method': 'POST',
					'access-control-request-headers': 'authorization,content-type',
				},
			})
		)
		expect(preflight.status).toBe(204)
		expect(preflight.headers.get('access-control-allow-origin')).toBe('*')
		expect(preflight.headers.get('access-control-allow-headers')).toContain('Authorization')

		const foreign = await call(rpc('initialize', INITIALIZE_PARAMS), token, { origin: 'https://claude.ai' })
		expect(foreign.status).toBe(200)
		expect(foreign.headers.get('access-control-allow-origin')).toBe('*')

		const unauthorizedCors = await call(rpc('initialize', INITIALIZE_PARAMS), null, { origin: 'https://claude.ai' })
		expect(unauthorizedCors.status).toBe(401)
		expect(unauthorizedCors.headers.get('access-control-allow-origin')).toBe('*')
		expect(unauthorizedCors.headers.get('access-control-expose-headers')).toContain('WWW-Authenticate')
	})

	it('405 for GET and DELETE, 404 for a sub-path', async () => {
		const get = await mcpApp.fetch(new Request('http://localhost:3001/api/mcp', { headers: { authorization: `Bearer ${token}` } }))
		expect(get.status).toBe(405)
		expect(get.headers.get('allow')).toBe('POST')
		const del = await mcpApp.fetch(
			new Request('http://localhost:3001/api/mcp', { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })
		)
		expect(del.status).toBe(405)
		const sub = await mcpApp.fetch(
			new Request('http://localhost:3001/api/mcp/anything', { method: 'POST', headers: { authorization: `Bearer ${token}` } })
		)
		expect(sub.status).toBe(404)
	})

	it('initialize and tools/list work as plain JSON responses', async () => {
		const init = await call(rpc('initialize', INITIALIZE_PARAMS), token)
		expect(init.status).toBe(200)
		expect(init.headers.get('content-type')).toContain('application/json')
		expect(init.headers.get('mcp-session-id')).toBeNull()
		const initBody = (await init.json()) as { result: { serverInfo: { name: string }; instructions?: string } }
		expect(initBody.result.serverInfo.name).toBe('giftwrapt')
		expect(initBody.result.instructions).toMatch(/owner view/i)

		const list = await call(rpc('tools/list', {}, 2), token)
		expect(list.status).toBe(200)
		const listBody = (await list.json()) as {
			result: { tools: Array<{ name: string; annotations?: Record<string, unknown>; outputSchema?: unknown; description?: string }> }
		}
		const names = listBody.result.tools.map(t => t.name).sort()
		for (const expected of [
			'get_me',
			'list_my_lists',
			'get_list',
			'list_people',
			'add_item',
			'add_items',
			'update_item',
			'delete_item',
			'create_list',
			'create_item_group',
			'search_my_items',
			'preview_url',
			'lookup_barcode',
		]) {
			expect(names, expected).toContain(expected)
		}
		for (const tool of listBody.result.tools) {
			expect(tool.description, tool.name).toBeTruthy()
			expect(tool.annotations, tool.name).toBeTruthy()
			expect(typeof tool.annotations?.readOnlyHint, tool.name).toBe('boolean')
			expect(typeof tool.annotations?.destructiveHint, tool.name).toBe('boolean')
			expect(typeof tool.annotations?.idempotentHint, tool.name).toBe('boolean')
			expect(tool.outputSchema, tool.name).toBeTruthy()
		}
	})

	it('a tool call over HTTP returns text plus structured content', async () => {
		const res = await call(rpc('tools/call', { name: 'get_me', arguments: {} }, 3), token)
		expect(res.status).toBe(200)
		const body = (await res.json()) as {
			result: { isError?: boolean; content: Array<{ type: string; text: string }>; structuredContent: { user: { id: string } } }
		}
		expect(body.result.isError).toBeFalsy()
		expect(body.result.content[0].text).toContain('Endpoint User')
		expect(body.result.structuredContent.user.id).toBe(userId)
	})

	it('400 for an unsupported Mcp-Protocol-Version, with the reason logged at warn', async () => {
		mcpChildLogs.length = 0
		const res = await call(rpc('tools/list', {}, 2), token, { 'mcp-protocol-version': '1999-01-01' })
		expect(res.status).toBe(400)

		expect(mcpChildLogs).toHaveLength(1)
		const reqLog = mcpChildLogs[0]
		expect(reqLog.bindings()).toMatchObject({ scope: 'mcp', clientId })
		expect(reqLog.warn).toHaveBeenCalledWith(
			expect.objectContaining({
				protocolVersion: '1999-01-01',
				err: expect.objectContaining({ message: expect.stringContaining('Unsupported protocol version: 1999-01-01') }),
			}),
			'mcp transport rejected request'
		)
		const logged = vi.mocked(reqLog.warn).mock.calls.map(([obj]) => ({ ...(obj as object), err: String((obj as { err: unknown }).err) }))
		expect(JSON.stringify(logged)).not.toContain(token)
	})

	it('rate-limits a user after 120 calls in a minute', async () => {
		let last: Response | null = null
		for (let i = 0; i < 121; i++) last = await call(rpc('initialize', INITIALIZE_PARAMS, i + 1), token)
		expect(last!.status).toBe(429)
		expect(last!.headers.get('retry-after')).toBeTruthy()
	})

	it('a read-only connection lists only lookup tools and cannot be made to write', async () => {
		const listNames = async (): Promise<Array<string>> => {
			const res = await call(rpc('tools/list', {}, 2), token)
			const body = (await res.json()) as { result: { tools: Array<{ name: string; annotations?: { readOnlyHint?: boolean } }> } }
			return body.result.tools.map(t => t.name)
		}
		// No access row: a grant from before the choice existed has full access.
		expect(await listNames()).toContain('add_item')

		const [app] = await db.select({ clientId: oauthApplication.clientId }).from(oauthApplication).limit(1)
		expect(await setMcpClientAccessImpl({ userId, clientId: app.clientId, access: 'read' })).toEqual({ ok: true })

		const names = await listNames()
		expect(names).toContain('get_me')
		expect(names).toContain('get_gift_context')
		for (const write of ['add_item', 'claim_item', 'delete_list', 'update_item', 'refresh_recommendations'])
			expect(names, write).not.toContain(write)

		// The instructions tell the model why, and where the user can change it.
		const init = await call(rpc('initialize', INITIALIZE_PARAMS, 3), token)
		const initBody = (await init.json()) as { result: { instructions: string } }
		expect(initBody.result.instructions).toMatch(/read-only/u)

		// Forcing a write tool by name fails; nothing is created.
		const forced = await call(rpc('tools/call', { name: 'create_list', arguments: { name: 'Sneaky', type: 'wishlist' } }, 4), token)
		const forcedBody = (await forced.json()) as { error?: { message: string }; result?: { isError?: boolean } }
		expect(forcedBody.error ?? forcedBody.result?.isError).toBeTruthy()
		expect(await db.select({ id: lists.id }).from(lists).where(eq(lists.ownerId, userId))).toEqual([])

		// A read tool still works, and switching back restores everything at once.
		const me = await call(rpc('tools/call', { name: 'get_me', arguments: {} }, 5), token)
		expect(((await me.json()) as { result: { isError?: boolean } }).result.isError).toBeFalsy()
		await setMcpClientAccessImpl({ userId, clientId: app.clientId, access: 'write' })
		expect(await listNames()).toContain('add_item')
	})

	it('the per-user budget is shared across instances, not per process', async () => {
		// Two limiter objects stand in for two app instances. Both count
		// against the same stored bucket, so together they allow `max`, not
		// `max` each.
		const instanceA = createDbRateLimiter({ name: 'mcp-shared-test', max: 4, windowMs: 60_000 })
		const instanceB = createDbRateLimiter({ name: 'mcp-shared-test', max: 4, windowMs: 60_000 })
		await instanceA._resetForTesting()
		try {
			const results: Array<boolean> = []
			for (let i = 0; i < 6; i++) results.push((await (i % 2 ? instanceB : instanceA).consume('user:u1')).allowed)
			expect(results).toEqual([true, true, true, true, false, false])
			// A different user has their own budget.
			expect((await instanceB.consume('user:u2')).allowed).toBe(true)
		} finally {
			await instanceA._resetForTesting()
		}
	})
})
