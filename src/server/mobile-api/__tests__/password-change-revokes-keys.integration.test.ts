// End-to-end integration test for the "password change / reset
// auto-revokes every other access path" wiring.
//
// Two paths:
//   1. `auth.api.changePassword` with `revokeOtherSessions: true` PLUS
//      a follow-up `revokeAllDevicesImpl(userId)` call (the production
//      wiring lives in `src/api/user.ts#updateUserPassword`).
//   2. `auth.api.resetPassword` after a `forgetPassword` token (the
//      production wiring lives in `src/lib/auth.ts` via
//      `emailAndPassword.revokeSessionsOnPasswordReset: true` plus the
//      `onPasswordReset` callback that calls `revokeAllDevicesImpl`).
//
// Both paths must leave existing mobile apiKeys unusable after
// completion. See `.notes/security/2026-05-checklist-audit.md` §47
// follow-up.

import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { apikey, appSettings, users, verification } from '@/db/schema'
import { auth } from '@/lib/auth'
import { mobileSignInLimiter } from '@/lib/rate-limits'
import { revokeAllDevicesImpl } from '@/server/mobile-api/devices'

import { mobileApp } from '../app'

const TEST_PASSWORD = 'integration-test-password'
const NEW_PASSWORD = 'integration-test-new-password'

let testEmail: string

async function enableMobileApp(enabled: boolean): Promise<void> {
	await db
		.insert(appSettings)
		.values({ key: 'enableMobileApp', value: enabled })
		.onConflictDoUpdate({ target: appSettings.key, set: { value: enabled } })
}

function setCookieToCookieHeader(res: Response): string {
	const getSetCookie = (res.headers as unknown as { getSetCookie?: () => Array<string> }).getSetCookie
	const list = typeof getSetCookie === 'function' ? getSetCookie.call(res.headers) : []
	if (list.length === 0) {
		const single = res.headers.get('set-cookie')
		if (!single) return ''
		return single
			.split(',')
			.map(s => s.split(';')[0]?.trim())
			.filter(Boolean)
			.join('; ')
	}
	return list
		.map(sc => sc.split(';')[0]?.trim())
		.filter(Boolean)
		.join('; ')
}

async function signUpAndGetCookie(email: string): Promise<{ userId: string; cookie: string }> {
	const res = await auth.api.signUpEmail({
		body: { name: 'Pwd Change Test', email, password: TEST_PASSWORD } as never,
		asResponse: true,
	})
	if (res.status !== 200) throw new Error(`signUpEmail failed: ${res.status} ${await res.text()}`)
	const body = (await res.json()) as { user: { id: string } }
	return { userId: body.user.id, cookie: setCookieToCookieHeader(res) }
}

async function mintMobileKey(deviceName: string): Promise<string> {
	const res = await mobileApp.fetch(
		new Request('http://t/api/mobile/v1/sign-in', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: testEmail, password: TEST_PASSWORD, deviceName }),
		})
	)
	if (res.status !== 200) throw new Error(`sign-in failed: ${res.status} ${await res.text()}`)
	const body = (await res.json()) as { apiKey: string }
	return body.apiKey
}

async function getMe(apiKey: string): Promise<Response> {
	return mobileApp.fetch(new Request('http://t/api/mobile/v1/me', { headers: { authorization: `Bearer ${apiKey}` } }))
}

describe('password change auto-revokes mobile apiKeys', () => {
	beforeEach(() => {
		testEmail = `pwd-revoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`
		mobileSignInLimiter._resetForTesting()
	})

	afterEach(async () => {
		const me = await db.query.users.findFirst({
			where: (u, { eq: ueq }) => ueq(u.email, testEmail),
			columns: { id: true },
		})
		if (me) {
			await db.delete(apikey).where(eq(apikey.userId, me.id))
			await db.delete(verification).where(eq(verification.identifier, me.id))
			await db.delete(users).where(eq(users.id, me.id))
		}
	})

	it('changePassword (with revokeOtherSessions + our revokeAllDevices follow-up) kills mobile keys', async () => {
		await enableMobileApp(true)
		const { userId, cookie } = await signUpAndGetCookie(testEmail)
		const apiKey = await mintMobileKey('iPhone')

		// Baseline: the key works.
		expect((await getMe(apiKey)).status).toBe(200)

		// Mirror what `src/api/user.ts#updateUserPassword` does: change
		// password with revokeOtherSessions, then revoke mobile keys.
		await auth.api.changePassword({
			body: {
				currentPassword: TEST_PASSWORD,
				newPassword: NEW_PASSWORD,
				revokeOtherSessions: true,
			},
			headers: new Headers({ cookie }),
		})
		await revokeAllDevicesImpl(userId)

		// Mobile key now dead.
		const after = await getMe(apiKey)
		expect(after.status).toBe(401)
		const afterBody = (await after.json()) as { error: { code: string } }
		expect(afterBody.error.code).toBe('unauthorized')

		// And no apikey rows remain in the DB for this user.
		const rows = await db.query.apikey.findMany({
			where: (k, { eq: keq }) => keq(k.userId, userId),
			columns: { id: true },
		})
		expect(rows.length).toBe(0)
	})

	it('resetPassword via forgetPassword token also kills mobile keys (onPasswordReset wiring)', async () => {
		await enableMobileApp(true)
		const { userId } = await signUpAndGetCookie(testEmail)
		const apiKey = await mintMobileKey('iPhone')
		expect((await getMe(apiKey)).status).toBe(200)

		// Trigger forgetPassword. The configured sendResetPassword is a
		// no-op when Resend isn't configured, but the verification token
		// is still written to the DB - we can read it directly.
		await auth.api.requestPasswordReset({
			body: { email: testEmail, redirectTo: '/reset-password' } as never,
			asResponse: true,
		})

		const vRow = await db.query.verification.findFirst({
			where: (v, { and: vand, eq: veq, like: vlike }) => vand(veq(v.value, userId), vlike(v.identifier, 'reset-password:%')),
			orderBy: (v, { desc }) => desc(v.createdAt),
		})
		expect(vRow).toBeDefined()
		const token = vRow!.identifier.replace(/^reset-password:/, '')
		expect(token.length).toBeGreaterThan(8)

		// Complete the reset. This goes through the `resetPassword`
		// endpoint, which calls our `onPasswordReset` hook.
		await auth.api.resetPassword({
			body: { newPassword: NEW_PASSWORD, token } as never,
			asResponse: true,
		})

		// Mobile key is dead.
		const after = await getMe(apiKey)
		expect(after.status).toBe(401)

		// No apikey rows remain.
		const rows = await db.query.apikey.findMany({
			where: (k, { eq: keq }) => keq(k.userId, userId),
			columns: { id: true },
		})
		expect(rows.length).toBe(0)
	})
})
