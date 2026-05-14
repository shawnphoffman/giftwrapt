// End-to-end integration test for mobile apiKey revocation.
//
// Covers `.notes/security/pre-release-smoke.md` §6: the operator-visible
// "revoke this device from /settings/devices" path. If revocation
// silently leaves the apiKey live, a lost / stolen device's key works
// until it expires - that's the audit risk this test guards.
//
// Cases:
//   1. Mint a key via sign-in, hit a protected endpoint with it -> 200.
//   2. Revoke the device via `DELETE /v1/me/devices/:keyId`.
//   3. Same protected endpoint with the same key -> 401 / unauthorized.
//   4. Two keys minted, `DELETE /v1/me/devices/all` (revoke-all) revokes
//      both, including the caller's own key (the documented behavior:
//      iOS sees the next 401 as the global sign-out signal).

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

async function signUpFreshUser(email: string): Promise<{ userId: string }> {
	const res = await auth.api.signUpEmail({
		body: { name: 'Revoke Test', email, password: TEST_PASSWORD } as never,
		asResponse: true,
	})
	if (res.status !== 200) {
		throw new Error(`signUpEmail failed: ${res.status} ${await res.text()}`)
	}
	const body = (await res.json()) as { user: { id: string } }
	return { userId: body.user.id }
}

async function signInForKey(deviceName: string): Promise<{ apiKey: string; keyId: string }> {
	const res = await mobileApp.fetch(
		new Request('http://t/api/mobile/v1/sign-in', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: testEmail, password: TEST_PASSWORD, deviceName }),
		})
	)
	if (res.status !== 200) throw new Error(`sign-in failed: ${res.status} ${await res.text()}`)
	const body = (await res.json()) as { apiKey: string; device: { id: string } }
	return { apiKey: body.apiKey, keyId: body.device.id }
}

async function getMe(apiKey: string): Promise<Response> {
	return mobileApp.fetch(new Request('http://t/api/mobile/v1/me', { headers: { authorization: `Bearer ${apiKey}` } }))
}

describe('mobile apiKey revocation', () => {
	beforeEach(() => {
		testEmail = `revoke-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`
		mobileSignInLimiter._resetForTesting()
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

	it('a revoked single device cannot reuse its apiKey', async () => {
		await enableMobileApp(true)
		await signUpFreshUser(testEmail)
		const { apiKey, keyId } = await signInForKey('My iPhone')

		// Baseline: the key works.
		expect((await getMe(apiKey)).status).toBe(200)

		// Revoke.
		const revokeRes = await mobileApp.fetch(
			new Request(`http://t/api/mobile/v1/me/devices/${keyId}`, {
				method: 'DELETE',
				headers: { authorization: `Bearer ${apiKey}` },
			})
		)
		expect(revokeRes.status).toBe(200)

		// Same key, now 401.
		const afterRes = await getMe(apiKey)
		expect(afterRes.status).toBe(401)
		const afterBody = (await afterRes.json()) as { error: { code: string } }
		expect(afterBody.error.code).toBe('unauthorized')
	})

	it('revoke-all invalidates every key including the caller', async () => {
		await enableMobileApp(true)
		await signUpFreshUser(testEmail)
		const { apiKey: keyA } = await signInForKey('iPhone A')
		const { apiKey: keyB } = await signInForKey('iPhone B')

		// Both keys work pre-revoke.
		expect((await getMe(keyA)).status).toBe(200)
		expect((await getMe(keyB)).status).toBe(200)

		// "Sign out everywhere": DELETE /v1/me/devices (no path param).
		const revokeAllRes = await mobileApp.fetch(
			new Request('http://t/api/mobile/v1/me/devices', {
				method: 'DELETE',
				headers: { authorization: `Bearer ${keyA}` },
			})
		)
		// Status may be 200 (handler returns the success body before the
		// caller's own key is checked again) or 401 (caller's own key was
		// among the revoked rows, depending on order of operations).
		// Either way, BOTH keys must be dead after the call.
		expect([200, 401]).toContain(revokeAllRes.status)

		expect((await getMe(keyA)).status).toBe(401)
		expect((await getMe(keyB)).status).toBe(401)
	})

	it('revoking another user’s device fails (not-yours / 404)', async () => {
		await enableMobileApp(true)
		await signUpFreshUser(testEmail)
		const { apiKey: ownerKey } = await signInForKey('Owner iPhone')

		// A second user with a key of their own.
		const otherEmail = `revoke-other-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`
		const otherSignUp = await auth.api.signUpEmail({
			body: { name: 'Other', email: otherEmail, password: TEST_PASSWORD } as never,
			asResponse: true,
		})
		expect(otherSignUp.status).toBe(200)
		const otherSignIn = await mobileApp.fetch(
			new Request('http://t/api/mobile/v1/sign-in', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email: otherEmail, password: TEST_PASSWORD, deviceName: 'Other iPhone' }),
			})
		)
		const otherBody = (await otherSignIn.json()) as { apiKey: string; device: { id: string } }
		const otherKeyId = otherBody.device.id

		// Owner tries to revoke the other user's device.
		const crossRes = await mobileApp.fetch(
			new Request(`http://t/api/mobile/v1/me/devices/${otherKeyId}`, {
				method: 'DELETE',
				headers: { authorization: `Bearer ${ownerKey}` },
			})
		)
		// Should fail. Exact status depends on the handler's error shape;
		// either 404 (we can't see other users' keys) or 4xx not-yours.
		expect(crossRes.status).toBeGreaterThanOrEqual(400)
		expect(crossRes.status).toBeLessThan(500)

		// Other user's key still works.
		const otherStillWorks = await mobileApp.fetch(
			new Request('http://t/api/mobile/v1/me', { headers: { authorization: `Bearer ${otherBody.apiKey}` } })
		)
		expect(otherStillWorks.status).toBe(200)

		// Cleanup: delete the other user manually since the global
		// afterEach only knows about `testEmail`.
		const other = await db.query.users.findFirst({
			where: (u, { eq: ueq }) => ueq(u.email, otherEmail),
			columns: { id: true },
		})
		if (other) {
			await db.delete(apikey).where(eq(apikey.userId, other.id))
			await db.delete(users).where(eq(users.id, other.id))
		}
	})
})
