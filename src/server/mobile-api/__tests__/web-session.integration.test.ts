// The iOS web tab's sign-in handoff (plan 28, ADR 0003), end to end:
//
//   mint:    POST /api/mobile/v1/web-session under a device apiKey returns
//            a single-use token and the absolute consume URL.
//   consume: POST /api/auth/mobile-web-handoff with that token sets a
//            one-day better-auth session cookie and 302s to the path.
//
// Every refusal branch the plugin documents is covered: replay, expiry,
// wrong token kind, revoked or disabled key, banned user, kill switch
// off. Plus the open-redirect guard (`to` outside the origin lands on /)
// and the invariant that the apiKey itself never resolves a session
// (apikey-no-session.integration.test.ts pins that more directly).

import { eq, like } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { apikey, appSettings, rateLimit, session as sessionTable, users, verification } from '@/db/schema'
import { auth } from '@/lib/auth'
import { mobileSignInLimiter, webHandoffLimiter } from '@/lib/rate-limits'
import { handleAuthRequest } from '@/server/mcp/oauth-gateway'

import { mobileApp } from '../app'
import { createPending } from '../auth-pending'

const BASE = 'http://localhost:3001'
const CONSUME_URL = `${BASE}/api/auth/mobile-web-handoff`
const TEST_PASSWORD = 'integration-test-password'

let testEmail: string

async function enableMobileApp(enabled: boolean): Promise<void> {
	await db
		.insert(appSettings)
		.values({ key: 'enableMobileApp', value: enabled })
		.onConflictDoUpdate({ target: appSettings.key, set: { value: enabled } })
}

async function signUpAndPair(): Promise<{ userId: string; apiKey: string; apiKeyId: string }> {
	const signUp = await auth.api.signUpEmail({
		body: { name: 'Web Session Test', email: testEmail, password: TEST_PASSWORD } as never,
		asResponse: true,
	})
	if (signUp.status !== 200) throw new Error(`signUpEmail failed: ${signUp.status} ${await signUp.text()}`)
	const { user } = (await signUp.json()) as { user: { id: string } }

	const signIn = await mobileApp.fetch(
		new Request(`${BASE}/api/mobile/v1/sign-in`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: testEmail, password: TEST_PASSWORD, deviceName: 'Web Session Phone' }),
		})
	)
	if (signIn.status !== 200) throw new Error(`sign-in failed: ${signIn.status} ${await signIn.text()}`)
	const body = (await signIn.json()) as { apiKey: string; device: { id: string } }
	return { userId: user.id, apiKey: body.apiKey, apiKeyId: body.device.id }
}

async function mint(apiKey: string, body?: unknown, rawBody?: string): Promise<Response> {
	return mobileApp.fetch(
		new Request(`${BASE}/api/mobile/v1/web-session`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
			body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
		})
	)
}

async function mintToken(apiKey: string, to?: string): Promise<string> {
	const res = await mint(apiKey, to === undefined ? {} : { to })
	if (res.status !== 200) throw new Error(`mint failed: ${res.status} ${await res.text()}`)
	const body = (await res.json()) as { token: string }
	return body.token
}

// The web view POSTs a form body; the test mirrors that content type.
async function consume(token: string, to?: string): Promise<Response> {
	const form = new URLSearchParams({ token })
	if (to !== undefined) form.set('to', to)
	return handleAuthRequest(
		new Request(CONSUME_URL, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'Mozilla/5.0 (iPhone) GiftWrapt-iOS/1.1.0' },
			body: form.toString(),
		})
	)
}

function cookieHeaderFrom(res: Response): string {
	return res.headers
		.getSetCookie()
		.map(c => c.split(';')[0])
		.join('; ')
}

describe('web session handoff', () => {
	beforeEach(async () => {
		testEmail = `web-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`
		await mobileSignInLimiter._resetForTesting()
		webHandoffLimiter._resetForTesting()
		// better-auth's DB-backed limiter caps the consume route at 10 per
		// minute (`rateLimit.customRules` in src/lib/auth.ts); the suite
		// exceeds that, so reset the counters between tests.
		await db.delete(rateLimit)
		await enableMobileApp(true)
	})

	afterEach(async () => {
		const me = await db.query.users.findFirst({
			where: (u, { eq: ueq }) => ueq(u.email, testEmail),
			columns: { id: true },
		})
		if (me) {
			await db.delete(sessionTable).where(eq(sessionTable.userId, me.id))
			await db.delete(apikey).where(eq(apikey.userId, me.id))
			await db.delete(users).where(eq(users.id, me.id))
		}
		await db.delete(verification).where(like(verification.identifier, 'mobile-auth-pending:%'))
	})

	describe('mint (POST /v1/web-session)', () => {
		it('returns a token, the 60-second ttl, and an absolute handoff url', async () => {
			const { apiKey } = await signUpAndPair()
			const res = await mint(apiKey, { to: '/lists/42' })
			expect(res.status).toBe(200)
			const body = (await res.json()) as { token: string; ttlSeconds: number; handoffUrl: string }
			expect(body.token.length).toBeGreaterThan(20)
			expect(body.ttlSeconds).toBe(60)
			expect(body.handoffUrl).toBe(CONSUME_URL)
		})

		it('accepts an empty body', async () => {
			const { apiKey } = await signUpAndPair()
			const res = await mint(apiKey)
			expect(res.status).toBe(200)
		})

		it('rejects a missing or bad apiKey with 401', async () => {
			const res = await mobileApp.fetch(new Request(`${BASE}/api/mobile/v1/web-session`, { method: 'POST' }))
			expect(res.status).toBe(401)
			expect(((await res.json()) as { error: { code: string } }).error.code).toBe('unauthorized')

			const bad = await mint('not-a-real-key', {})
			expect(bad.status).toBe(401)
		})

		it('rejects an invalid body with 400 invalid-input and issues', async () => {
			const { apiKey } = await signUpAndPair()
			const res = await mint(apiKey, { to: 123 })
			expect(res.status).toBe(400)
			const body = (await res.json()) as { error: { code: string; data: { issues: Array<unknown> } } }
			expect(body.error.code).toBe('invalid-input')
			expect(body.error.data.issues.length).toBeGreaterThan(0)

			const notJson = await mint(apiKey, undefined, '{not json')
			expect(notJson.status).toBe(400)
			expect(((await notJson.json()) as { error: { code: string } }).error.code).toBe('invalid-json')
		})

		it('refuses while the kill switch is off', async () => {
			const { apiKey } = await signUpAndPair()
			await enableMobileApp(false)
			const res = await mint(apiKey, {})
			expect(res.status).toBe(503)
			expect(((await res.json()) as { error: { code: string } }).error.code).toBe('mobile-app-disabled')
		})
	})

	describe('consume (POST /api/auth/mobile-web-handoff)', () => {
		it('sets a one-day session cookie and 302s to the requested path', async () => {
			const { userId, apiKey } = await signUpAndPair()
			const token = await mintToken(apiKey, '/lists/42?tab=items')
			// Sign-up and the mobile sign-in each left a session row behind
			// (the mobile one is discarded, never sent); only the new row matters.
			const before = new Set(
				(await db.select({ id: sessionTable.id }).from(sessionTable).where(eq(sessionTable.userId, userId))).map(r => r.id)
			)

			const res = await consume(token)
			expect(res.status).toBe(302)
			expect(res.headers.get('location')).toBe(`${BASE}/lists/42?tab=items`)
			expect(res.headers.get('cache-control')).toBe('no-store')
			expect(res.headers.get('referrer-policy')).toBe('no-referrer')

			const setCookies = res.headers.getSetCookie()
			const sessionCookie = setCookies.find(c => c.startsWith('better-auth.session_token='))
			expect(sessionCookie).toBeDefined()
			// "Do not remember me": no Max-Age / Expires on the cookie, so it
			// dies with the web view's process; the row itself lasts a day.
			expect(sessionCookie).not.toMatch(/max-age=/i)
			expect(sessionCookie).not.toMatch(/expires=/i)

			const resolved = await auth.api.getSession({ headers: new Headers({ cookie: cookieHeaderFrom(res) }) })
			expect(resolved?.user.id).toBe(userId)
			const rows = await db
				.select({ id: sessionTable.id, expiresAt: sessionTable.expiresAt })
				.from(sessionTable)
				.where(eq(sessionTable.userId, userId))
			const created = rows.filter(r => !before.has(r.id))
			expect(created.length).toBe(1)
			const ttlMs = created[0].expiresAt.getTime() - Date.now()
			expect(ttlMs).toBeGreaterThan(23 * 60 * 60 * 1000)
			expect(ttlMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 5_000)
		})

		it('lands on / when no path was given', async () => {
			const { apiKey } = await signUpAndPair()
			const res = await consume(await mintToken(apiKey))
			expect(res.status).toBe(302)
			expect(res.headers.get('location')).toBe(`${BASE}/`)
		})

		it('collapses an off-origin or internal path to / at mint and at consume', async () => {
			const { apiKey } = await signUpAndPair()
			const minted = await consume(await mintToken(apiKey, 'https://evil.example/phish'))
			expect(minted.status).toBe(302)
			expect(minted.headers.get('location')).toBe(`${BASE}/`)

			const overridden = await consume(await mintToken(apiKey, '/lists/1'), '//evil.example')
			expect(overridden.status).toBe(302)
			expect(overridden.headers.get('location')).toBe(`${BASE}/`)

			const internal = await consume(await mintToken(apiKey, '/lists/1'), '/_serverFn/x')
			expect(internal.headers.get('location')).toBe(`${BASE}/`)
		})

		it('lets the body override the minted path when both are same-origin', async () => {
			const { apiKey } = await signUpAndPair()
			const res = await consume(await mintToken(apiKey, '/lists/1'), '/settings')
			expect(res.headers.get('location')).toBe(`${BASE}/settings`)
		})

		it('is single-use: a replay is refused with a plain 400 and no cookie', async () => {
			const { apiKey } = await signUpAndPair()
			const token = await mintToken(apiKey)
			expect((await consume(token)).status).toBe(302)

			const replay = await consume(token)
			expect(replay.status).toBe(400)
			expect(replay.headers.get('content-type')).toContain('text/plain')
			expect(replay.headers.get('cache-control')).toBe('no-store')
			expect(replay.headers.getSetCookie()).toEqual([])
			expect(await replay.text()).not.toContain('<form')
		})

		it('refuses an unknown token and a token of another kind', async () => {
			expect((await consume('not-a-token')).status).toBe(400)

			const other = await createPending({ kind: 'totp', cookieHeader: 'x=y', deviceName: 'Phone' }, 60)
			expect((await consume(other.token)).status).toBe(400)
			// The wrong-kind attempt burned the row, so nothing else can redeem it either.
			const gone = await db
				.select()
				.from(verification)
				.where(eq(verification.identifier, `mobile-auth-pending:${other.token}`))
			expect(gone.length).toBe(0)
		})

		it('refuses an expired token', async () => {
			const { apiKey } = await signUpAndPair()
			const token = await mintToken(apiKey)
			await db
				.update(verification)
				.set({ expiresAt: new Date(Date.now() - 1_000) })
				.where(eq(verification.identifier, `mobile-auth-pending:${token}`))
			expect((await consume(token)).status).toBe(400)
		})

		it('refuses once the device key is revoked, and once it is disabled', async () => {
			const { apiKey, apiKeyId } = await signUpAndPair()

			const disabledToken = await mintToken(apiKey)
			await db.update(apikey).set({ enabled: false }).where(eq(apikey.id, apiKeyId))
			expect((await consume(disabledToken)).status).toBe(400)
			await db.update(apikey).set({ enabled: true }).where(eq(apikey.id, apiKeyId))

			const expiredKeyToken = await mintToken(apiKey)
			await db
				.update(apikey)
				.set({ expiresAt: new Date(Date.now() - 1_000) })
				.where(eq(apikey.id, apiKeyId))
			expect((await consume(expiredKeyToken)).status).toBe(400)
			await db.update(apikey).set({ expiresAt: null }).where(eq(apikey.id, apiKeyId))

			const revokedToken = await mintToken(apiKey)
			await db.delete(apikey).where(eq(apikey.id, apiKeyId))
			expect((await consume(revokedToken)).status).toBe(400)
		})

		it('refuses a banned user', async () => {
			const { userId, apiKey } = await signUpAndPair()
			const token = await mintToken(apiKey)
			await db.update(users).set({ banned: true }).where(eq(users.id, userId))
			const res = await consume(token)
			expect(res.status).toBe(400)
			expect(res.headers.getSetCookie()).toEqual([])
		})

		it('refuses while the kill switch is off, even for a token minted before the flip', async () => {
			const { apiKey } = await signUpAndPair()
			const token = await mintToken(apiKey)
			await enableMobileApp(false)
			const res = await consume(token)
			expect(res.status).toBe(400)
			expect(res.headers.getSetCookie()).toEqual([])
		})

		it('never turns the apiKey itself into a session', async () => {
			const { apiKey } = await signUpAndPair()
			const asForm = await handleAuthRequest(
				new Request(CONSUME_URL, {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({ token: apiKey }).toString(),
				})
			)
			expect(asForm.status).toBe(400)
			expect(await auth.api.getSession({ headers: new Headers({ 'x-api-key': apiKey }) })).toBeNull()
		})
	})
})
