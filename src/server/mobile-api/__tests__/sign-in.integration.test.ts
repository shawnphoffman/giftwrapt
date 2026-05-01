// End-to-end integration test for the mobile sign-in flow.
//
// Exercises the cookie-extraction dance in `v1.ts`'s
// `setCookiesToCookieHeader` helper by:
//   1. Creating a real user with a password via `auth.api.signUpEmail`.
//   2. Hitting `mobileApp.fetch(POST /v1/sign-in)` with that account.
//   3. Asserting the response shape (apiKey, user, device) and the
//      kill-switch / rate-limit / bad-creds branches.
//   4. Using the issued apiKey to hit `/v1/me` and `/v1/me/devices`.
//
// Why this test is here: the sign-in flow depends on
//   - better-auth setting Set-Cookie on `signInEmail` responses
//   - our parser reconstructing a `cookie:` request header
//   - better-auth's `getSession` accepting that header
//   - `enableSessionForAPIKeys: true` letting `createApiKey` see the
//     session
// If any of those break, this test catches it before iOS would.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { apikey, appSettings, users } from '@/db/schema'
import { auth } from '@/lib/auth'
import { mobileSignInLimiter } from '@/lib/rate-limits'

import { mobileApp } from '../app'

const TEST_PASSWORD = 'integration-test-password'

let testEmail: string

async function enableMobileApp(enabled: boolean): Promise<void> {
	await db
		.insert(appSettings)
		.values({ key: 'enableMobileApp', value: enabled })
		.onConflictDoUpdate({ target: appSettings.key, set: { value: enabled } })
}

async function signUpFreshUser(email: string): Promise<{ userId: string }> {
	// Don't pass `role` - better-auth's admin plugin rejects non-admin
	// callers setting it ("ROLE_IS_NOT_ALLOWED_TO_BE_SET"). The first
	// user becomes admin via the `databaseHooks.user.create.before` in
	// `src/lib/auth.ts`; subsequent users default to 'user'.
	const res = await auth.api.signUpEmail({
		body: {
			name: 'Sign-in Test',
			email,
			password: TEST_PASSWORD,
		} as never,
		asResponse: true,
	})
	if (res.status !== 200) {
		throw new Error(`signUpEmail failed: ${res.status} ${await res.text()}`)
	}
	const body = (await res.json()) as { user: { id: string } }
	return { userId: body.user.id }
}

async function postSignIn(body: unknown, headers: HeadersInit = {}): Promise<Response> {
	return mobileApp.fetch(
		new Request('http://t/api/mobile/v1/sign-in', {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...headers },
			body: JSON.stringify(body),
		})
	)
}

describe('mobile sign-in flow', () => {
	beforeEach(() => {
		testEmail = `signin-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`
		// The in-memory IP-keyed limiter is shared across tests; reset so a
		// previous test's burst doesn't 429 the next one.
		mobileSignInLimiter._resetForTesting()
	})

	afterEach(async () => {
		// pglite is per-worker, not per-test. Cleanup avoids leaking accounts
		// across tests and prevents UNIQUE collisions if the random email ever
		// repeats.
		const me = await db.query.users.findFirst({
			where: (u, { eq }) => eq(u.email, testEmail),
			columns: { id: true },
		})
		if (me) {
			await db.delete(apikey).where(eq(apikey.userId, me.id))
			await db.delete(users).where(eq(users.id, me.id))
		}
	})

	it('returns 503 when the kill switch is off', async () => {
		await enableMobileApp(false)
		await signUpFreshUser(testEmail)
		const res = await postSignIn({ email: testEmail, password: TEST_PASSWORD, deviceName: 'My iPhone' })
		expect(res.status).toBe(503)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('mobile-app-disabled')
	})

	it('mints an apiKey + returns the device summary on valid credentials', async () => {
		await enableMobileApp(true)
		const { userId } = await signUpFreshUser(testEmail)

		const res = await postSignIn({ email: testEmail, password: TEST_PASSWORD, deviceName: 'My iPhone' })
		expect(res.status).toBe(200)
		const body = (await res.json()) as {
			apiKey: string
			user: { id: string; email: string; isAdmin: boolean; isChild: boolean }
			device: { id: string; prefix: string | null; name: string | null; createdAt: string }
		}
		expect(typeof body.apiKey).toBe('string')
		expect(body.apiKey.length).toBeGreaterThan(20)
		expect(body.user.id).toBe(userId)
		expect(body.user.email).toBe(testEmail)
		expect(body.user.isChild).toBe(false)
		expect(body.device.id.length).toBeGreaterThan(0)
		expect(body.device.name).toBe('My iPhone')

		// Use the issued apiKey to hit /v1/me. Wire shape MUST match the
		// `user` block from sign-in.
		const meRes = await mobileApp.fetch(
			new Request('http://t/api/mobile/v1/me', {
				headers: { authorization: `Bearer ${body.apiKey}` },
			})
		)
		expect(meRes.status).toBe(200)
		const me = (await meRes.json()) as { id: string; email: string; isAdmin: boolean }
		expect(me.id).toBe(body.user.id)
		expect(me.email).toBe(body.user.email)
		expect(me.isAdmin).toBe(body.user.isAdmin)

		// /v1/me/devices should include the just-issued device with isCurrent.
		const devicesRes = await mobileApp.fetch(
			new Request('http://t/api/mobile/v1/me/devices', {
				headers: { authorization: `Bearer ${body.apiKey}` },
			})
		)
		expect(devicesRes.status).toBe(200)
		const devicesBody = (await devicesRes.json()) as { devices: Array<{ id: string; isCurrent: boolean }> }
		const me_device = devicesBody.devices.find(d => d.id === body.device.id)
		expect(me_device).toBeDefined()
		expect(me_device?.isCurrent).toBe(true)
	})

	it('returns 401 sign-in-failed on a wrong password', async () => {
		await enableMobileApp(true)
		await signUpFreshUser(testEmail)
		const res = await postSignIn({ email: testEmail, password: 'definitely-wrong', deviceName: 'iPhone' })
		expect(res.status).toBe(401)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('sign-in-failed')
	})

	it('returns 401 sign-in-failed for an unknown email (does not leak existence)', async () => {
		await enableMobileApp(true)
		const res = await postSignIn({ email: `nonexistent-${Date.now()}@test.local`, password: 'x', deviceName: 'iPhone' })
		expect(res.status).toBe(401)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('sign-in-failed')
	})

	it('returns 400 invalid-input for malformed body', async () => {
		await enableMobileApp(true)
		const res = await postSignIn({ email: 'not-an-email', password: '', deviceName: '' })
		expect(res.status).toBe(400)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('invalid-input')
	})

	it('rate-limits after 10 attempts per IP', async () => {
		await enableMobileApp(true)
		const headers = { 'x-forwarded-for': '203.0.113.42' }
		const fail = { email: 'rl@test.local', password: 'x', deviceName: 'iPhone' }
		// 10 allowed attempts (all 401, but they consume the bucket).
		for (let i = 0; i < 10; i++) {
			const r = await postSignIn(fail, headers)
			expect([400, 401]).toContain(r.status)
		}
		// 11th hits the limiter.
		const limited = await postSignIn(fail, headers)
		expect(limited.status).toBe(429)
		expect(limited.headers.get('Retry-After')).not.toBeNull()
		const body = (await limited.json()) as { error: { code: string; data?: { retryAfterSeconds: number } } }
		expect(body.error.code).toBe('rate-limited')
		expect(body.error.data?.retryAfterSeconds).toBeGreaterThan(0)
	})
})

// `eq` is imported via the schema barrel for the cleanup helper.
import { eq } from 'drizzle-orm'
