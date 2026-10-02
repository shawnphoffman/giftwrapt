// A banned user's mobile apiKey must stop working.
//
// better-auth's verifyApiKey never checks ban status and banning does not
// delete keys, so the guard in ../auth.ts reads `users.banned` itself.
// Unbanning restores the same key (nothing was deleted).

import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { apikey, appSettings, users } from '@/db/schema'
import { auth } from '@/lib/auth'
import { mobileSignInLimiter } from '@/lib/rate-limits'

import { mobileApp } from '../app'

const TEST_PASSWORD = 'integration-test-password'

let testEmail: string

async function enableMobileApp(): Promise<void> {
	await db
		.insert(appSettings)
		.values({ key: 'enableMobileApp', value: true })
		.onConflictDoUpdate({ target: appSettings.key, set: { value: true } })
}

async function signUpAndGetKey(): Promise<{ userId: string; apiKey: string }> {
	const signUp = await auth.api.signUpEmail({
		body: { name: 'Ban Test', email: testEmail, password: TEST_PASSWORD } as never,
		asResponse: true,
	})
	if (signUp.status !== 200) throw new Error(`signUpEmail failed: ${signUp.status} ${await signUp.text()}`)
	const { user } = (await signUp.json()) as { user: { id: string } }

	const signIn = await mobileApp.fetch(
		new Request('http://t/api/mobile/v1/sign-in', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: testEmail, password: TEST_PASSWORD, deviceName: 'Ban Test Phone' }),
		})
	)
	if (signIn.status !== 200) throw new Error(`sign-in failed: ${signIn.status} ${await signIn.text()}`)
	const { apiKey } = (await signIn.json()) as { apiKey: string }
	return { userId: user.id, apiKey }
}

async function getMe(apiKey: string): Promise<Response> {
	return mobileApp.fetch(new Request('http://t/api/mobile/v1/me', { headers: { authorization: `Bearer ${apiKey}` } }))
}

describe('mobile apiKey for a banned user', () => {
	beforeEach(async () => {
		testEmail = `ban-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`
		await mobileSignInLimiter._resetForTesting()
		await enableMobileApp()
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

	it('rejects the key while the ban is in force and accepts it again after unban', async () => {
		const { userId, apiKey } = await signUpAndGetKey()
		expect((await getMe(apiKey)).status).toBe(200)

		await db.update(users).set({ banned: true }).where(eq(users.id, userId))
		const banned = await getMe(apiKey)
		expect(banned.status).toBe(401)
		expect(((await banned.json()) as { error: { code: string } }).error.code).toBe('unauthorized')

		await db.update(users).set({ banned: false }).where(eq(users.id, userId))
		expect((await getMe(apiKey)).status).toBe(200)
	})
})
