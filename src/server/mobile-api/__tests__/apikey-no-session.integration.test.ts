// Regression test: a mobile apiKey must never double as a web session.
//
// better-auth's apiKey plugin has an `enableSessionForAPIKeys` option.
// When it is on, a before-hook turns any request carrying an
// `x-api-key` header into a full session, which would let a device key
// authenticate every web server fn and the cookie-authenticated
// `/api/*` routes, bypassing the `enableMobileApp` kill switch. It is
// off in `src/lib/auth.ts`; this test pins that.
//
// Cases:
//   1. `getSession` with only an `x-api-key` header resolves no session.
//   2. The same key still works on the mobile gateway as a bearer.
//   3. `verifyApiKey` still validates the key (what the gateway uses).

import { eq } from 'drizzle-orm'
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

async function signUpFreshUser(email: string): Promise<void> {
	const res = await auth.api.signUpEmail({
		body: { name: 'No Session Test', email, password: TEST_PASSWORD } as never,
		asResponse: true,
	})
	if (res.status !== 200) {
		throw new Error(`signUpEmail failed: ${res.status} ${await res.text()}`)
	}
}

async function signInForKey(): Promise<string> {
	const res = await mobileApp.fetch(
		new Request('http://t/api/mobile/v1/sign-in', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: testEmail, password: TEST_PASSWORD, deviceName: 'No Session Phone' }),
		})
	)
	if (res.status !== 200) throw new Error(`sign-in failed: ${res.status} ${await res.text()}`)
	const body = (await res.json()) as { apiKey: string }
	return body.apiKey
}

describe('mobile apiKey never becomes a web session', () => {
	beforeEach(async () => {
		testEmail = `no-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`
		await mobileSignInLimiter._resetForTesting()
		await enableMobileApp(true)
		await signUpFreshUser(testEmail)
	})

	afterEach(async () => {
		const me = await db.query.users.findFirst({
			where: (u, { eq: ueq }) => ueq(u.email, testEmail),
			columns: { id: true },
		})
		if (me) {
			await db.delete(apikey).where(eq(apikey.userId, me.id))
			await db.delete(users).where(eq(users.id, me.id))
		}
	})

	it('getSession ignores an x-api-key header', async () => {
		const key = await signInForKey()

		const session = await auth.api.getSession({ headers: new Headers({ 'x-api-key': key }) })
		expect(session).toBeNull()
	})

	it('the same key still authenticates the mobile gateway as a bearer', async () => {
		const key = await signInForKey()

		const res = await mobileApp.fetch(new Request('http://t/api/mobile/v1/me', { headers: { authorization: `Bearer ${key}` } }))
		expect(res.status).toBe(200)
		const body = (await res.json()) as { email: string }
		expect(body.email).toBe(testEmail)
	})

	it('verifyApiKey still validates the key', async () => {
		const key = await signInForKey()

		const result = await auth.api.verifyApiKey({ body: { key } })
		expect(result.valid).toBe(true)
		expect(result.key?.userId).toBeTruthy()
	})
})
