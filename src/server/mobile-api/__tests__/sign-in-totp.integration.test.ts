// End-to-end integration test for the mobile sign-in 2FA fork.
//
// Sign-up + enable TOTP for a fresh user, then exercise:
//   1. POST /v1/sign-in returns `{ challengeToken, ttlSeconds, methods }`
//      instead of `{ apiKey, ... }` because the user is enrolled.
//   2. POST /v1/auth/totp/verify with the correct code mints the apiKey
//      and the standard envelope.
//   3. Wrong code -> `invalid-code` 401 AND the token is single-use
//      (replaying it gives `invalid-challenge`).
//   4. Unknown token -> `invalid-challenge` 400.
//
// Plus a smoke test for /v1/auth/capabilities that confirms the
// envelope shape iOS branches on.

import { createHmac } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { apikey, appSettings, twoFactor as twoFactorTable, users } from '@/db/schema'
import { auth } from '@/lib/auth'
import { mobileSignInLimiter } from '@/lib/rate-limits'

import { mobileApp } from '../app'

const TEST_PASSWORD = 'integration-test-password'

let testEmail: string

/**
 * RFC 6238 TOTP. Inline to avoid pulling in `@better-auth/utils` as a
 * devDep just for the test - the spec is short and the standard
 * 30-second / 6-digit / SHA-1 settings match what better-auth's
 * `twoFactor()` plugin uses by default.
 */
function decodeBase32(secret: string): Buffer {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
	const cleaned = secret.replace(/=+$/, '').toUpperCase()
	let bits = ''
	for (const ch of cleaned) {
		const idx = alphabet.indexOf(ch)
		if (idx < 0) throw new Error(`bad base32 char: ${ch}`)
		bits += idx.toString(2).padStart(5, '0')
	}
	const bytes: Array<number> = []
	for (let i = 0; i + 8 <= bits.length; i += 8) {
		bytes.push(parseInt(bits.slice(i, i + 8), 2))
	}
	return Buffer.from(bytes)
}

function generateTotp(base32Secret: string, atSeconds = Math.floor(Date.now() / 1000)): string {
	const counter = Math.floor(atSeconds / 30)
	const counterBuf = Buffer.alloc(8)
	counterBuf.writeBigUInt64BE(BigInt(counter))
	const hmac = createHmac('sha1', decodeBase32(base32Secret)).update(counterBuf).digest()
	const offset = hmac[hmac.length - 1] & 0x0f
	const code =
		((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff)
	return String(code % 1_000_000).padStart(6, '0')
}

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

/**
 * Sign up a user and enroll them in TOTP. Returns the user id and the
 * base32 secret pulled from the enrollment URI so the test can
 * generate matching codes.
 */
async function signUpAndEnableTotp(email: string): Promise<{ userId: string; secret: string }> {
	const signUpRes = await auth.api.signUpEmail({
		body: {
			name: 'TOTP Test',
			email,
			password: TEST_PASSWORD,
		} as never,
		asResponse: true,
	})
	if (signUpRes.status !== 200) {
		throw new Error(`signUpEmail failed: ${signUpRes.status} ${await signUpRes.text()}`)
	}
	const signUpBody = (await signUpRes.json()) as { user: { id: string } }
	const userId = signUpBody.user.id
	const cookie = setCookieToCookieHeader(signUpRes)

	// Step 1: enroll. Returns the totpURI but DOESN'T flip twoFactorEnabled
	// yet (skipVerificationOnEnable defaults to false).
	const enableRes = await auth.api.enableTwoFactor({
		body: { password: TEST_PASSWORD },
		headers: new Headers({ cookie }),
		asResponse: true,
	})
	if (enableRes.status !== 200) {
		throw new Error(`enableTwoFactor failed: ${enableRes.status} ${await enableRes.text()}`)
	}
	const enableBody = (await enableRes.json()) as { totpURI: string }
	const url = new URL(enableBody.totpURI)
	const secret = url.searchParams.get('secret')
	if (!secret) throw new Error(`no secret in totpURI: ${enableBody.totpURI}`)

	// Step 2: confirm enrollment with a fresh TOTP code so
	// twoFactorEnabled flips to true. This mirrors the web settings
	// flow's "verify code to finish enrollment" step.
	const code = generateTotp(secret)
	const verifyRes = await auth.api.verifyTOTP({
		body: { code, trustDevice: false },
		headers: new Headers({ cookie }),
		asResponse: true,
	})
	if (verifyRes.status !== 200) {
		throw new Error(`verifyTOTP (enrollment) failed: ${verifyRes.status} ${await verifyRes.text()}`)
	}

	return { userId, secret }
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

async function postTotpVerify(body: unknown): Promise<Response> {
	return mobileApp.fetch(
		new Request('http://t/api/mobile/v1/auth/totp/verify', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		})
	)
}

describe('mobile sign-in: TOTP fork', () => {
	beforeEach(() => {
		testEmail = `totp-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`
		mobileSignInLimiter._resetForTesting()
	})

	afterEach(async () => {
		const me = await db.query.users.findFirst({
			where: (u, { eq: ueq }) => ueq(u.email, testEmail),
			columns: { id: true },
		})
		if (me) {
			await db.delete(apikey).where(eq(apikey.userId, me.id))
			await db.delete(twoFactorTable).where(eq(twoFactorTable.userId, me.id))
			await db.delete(users).where(eq(users.id, me.id))
		}
	})

	it('sign-in returns a challenge instead of an apiKey when TOTP is enrolled', async () => {
		await enableMobileApp(true)
		await signUpAndEnableTotp(testEmail)

		const res = await postSignIn({ email: testEmail, password: TEST_PASSWORD, deviceName: 'My iPhone' })
		expect(res.status).toBe(200)
		const body = (await res.json()) as {
			apiKey?: string
			challengeToken?: string
			ttlSeconds?: number
			methods?: Array<string>
		}
		expect(body.apiKey).toBeUndefined()
		expect(typeof body.challengeToken).toBe('string')
		expect(body.challengeToken!.length).toBeGreaterThan(20)
		expect(body.ttlSeconds).toBeGreaterThan(0)
		expect(body.methods).toEqual(['totp'])
	})

	it('totp/verify with correct code mints an apiKey under the standard envelope', async () => {
		await enableMobileApp(true)
		const { userId, secret } = await signUpAndEnableTotp(testEmail)

		const signInRes = await postSignIn({ email: testEmail, password: TEST_PASSWORD, deviceName: 'My iPhone' })
		const signInBody = (await signInRes.json()) as { challengeToken: string }
		expect(signInBody.challengeToken).toBeDefined()

		const code = generateTotp(secret)
		const verifyRes = await postTotpVerify({ challengeToken: signInBody.challengeToken, code })
		expect(verifyRes.status).toBe(200)
		const verifyBody = (await verifyRes.json()) as {
			apiKey: string
			user: { id: string; email: string; isAdmin: boolean; isChild: boolean }
			device: { id: string; name: string | null }
		}
		expect(typeof verifyBody.apiKey).toBe('string')
		expect(verifyBody.apiKey.length).toBeGreaterThan(20)
		expect(verifyBody.user.id).toBe(userId)
		expect(verifyBody.user.email).toBe(testEmail)
		expect(verifyBody.device.name).toBe('My iPhone')

		// The minted apiKey works against /v1/me.
		const meRes = await mobileApp.fetch(
			new Request('http://t/api/mobile/v1/me', {
				headers: { authorization: `Bearer ${verifyBody.apiKey}` },
			})
		)
		expect(meRes.status).toBe(200)
	})

	it('totp/verify with a wrong code returns invalid-code and burns the token', async () => {
		await enableMobileApp(true)
		await signUpAndEnableTotp(testEmail)

		const signInRes = await postSignIn({ email: testEmail, password: TEST_PASSWORD, deviceName: 'iPhone' })
		const { challengeToken } = (await signInRes.json()) as { challengeToken: string }

		const wrongRes = await postTotpVerify({ challengeToken, code: '000000' })
		expect(wrongRes.status).toBe(401)
		const wrongBody = (await wrongRes.json()) as { error: { code: string } }
		expect(wrongBody.error.code).toBe('invalid-code')

		// Token is single-use; even a correct code can't redeem it now.
		const replayRes = await postTotpVerify({ challengeToken, code: '000000' })
		expect(replayRes.status).toBe(400)
		const replayBody = (await replayRes.json()) as { error: { code: string } }
		expect(replayBody.error.code).toBe('invalid-challenge')
	})

	it('totp/verify with an unknown challengeToken returns invalid-challenge', async () => {
		await enableMobileApp(true)
		const res = await postTotpVerify({ challengeToken: 'not-a-real-token', code: '123456' })
		expect(res.status).toBe(400)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('invalid-challenge')
	})
})

describe('mobile auth capabilities probe', () => {
	beforeEach(() => {
		mobileSignInLimiter._resetForTesting()
	})

	it('returns the documented capabilities envelope', async () => {
		const res = await mobileApp.fetch(new Request('http://t/api/mobile/v1/auth/capabilities'))
		expect(res.status).toBe(200)
		const body = (await res.json()) as {
			password: boolean
			totp: boolean
			passkey: boolean
			oidc: Array<{ id: string; label: string; kind: string }>
		}
		expect(body.password).toBe(true)
		expect(body.totp).toBe(true)
		expect(body.passkey).toBe(true)
		expect(Array.isArray(body.oidc)).toBe(true)
		// No oauthApplication rows are seeded by default.
		for (const row of body.oidc) {
			expect(typeof row.id).toBe('string')
			expect(typeof row.label).toBe('string')
			expect(row.kind).toBe('generic')
		}
	})
})
