// End-to-end integration test for the TOTP enable -> disable -> re-enable
// cycle. Covers `.notes/security/pre-release-smoke.md` §4.
//
// Three checks:
//   1. After disable, the next sign-in returns an apiKey directly (no
//      challengeToken) - i.e. the 2FA requirement actually drops.
//   2. Re-enabling produces a NEW secret. A sticky secret would mean an
//      attacker who exfiltrated the original secret keeps a usable code
//      generator across an "I rotated 2FA" attempt.
//   3. The re-enrolled secret produces working codes (the new secret
//      isn't garbage / mis-encoded).

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

// RFC 6238 TOTP - same impl as sign-in-totp.integration.test.ts. Duplicated
// here intentionally so this test file is self-contained and you can read
// it without jumping files.
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

async function signUpAndGetCookie(email: string): Promise<{ userId: string; cookie: string }> {
	const res = await auth.api.signUpEmail({
		body: { name: 'TOTP Lifecycle', email, password: TEST_PASSWORD } as never,
		asResponse: true,
	})
	if (res.status !== 200) throw new Error(`signUpEmail failed: ${res.status} ${await res.text()}`)
	const body = (await res.json()) as { user: { id: string } }
	return { userId: body.user.id, cookie: setCookieToCookieHeader(res) }
}

// Drives one enable + verify cycle. Returns the secret pulled from the
// otpauth URI - the test asserts secret churn across cycles.
async function enrollTotp(cookie: string): Promise<string> {
	const enableRes = await auth.api.enableTwoFactor({
		body: { password: TEST_PASSWORD },
		headers: new Headers({ cookie }),
		asResponse: true,
	})
	if (enableRes.status !== 200) throw new Error(`enableTwoFactor failed: ${enableRes.status} ${await enableRes.text()}`)
	const enableBody = (await enableRes.json()) as { totpURI: string }
	const url = new URL(enableBody.totpURI)
	const secret = url.searchParams.get('secret')
	if (!secret) throw new Error(`no secret in totpURI: ${enableBody.totpURI}`)

	const verifyRes = await auth.api.verifyTOTP({
		body: { code: generateTotp(secret), trustDevice: false },
		headers: new Headers({ cookie }),
		asResponse: true,
	})
	if (verifyRes.status !== 200) throw new Error(`verifyTOTP failed: ${verifyRes.status} ${await verifyRes.text()}`)
	return secret
}

async function disableTotp(cookie: string): Promise<void> {
	const res = await auth.api.disableTwoFactor({
		body: { password: TEST_PASSWORD },
		headers: new Headers({ cookie }),
		asResponse: true,
	})
	if (res.status !== 200) throw new Error(`disableTwoFactor failed: ${res.status} ${await res.text()}`)
}

async function postSignIn(): Promise<Response> {
	return mobileApp.fetch(
		new Request('http://t/api/mobile/v1/sign-in', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: testEmail, password: TEST_PASSWORD, deviceName: 'iPhone' }),
		})
	)
}

describe('mobile 2FA lifecycle: enable -> disable -> re-enable', () => {
	beforeEach(() => {
		testEmail = `totp-lifecycle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`
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

	it('disable drops the TOTP challenge: next sign-in mints apiKey directly', async () => {
		await enableMobileApp(true)
		const { cookie } = await signUpAndGetCookie(testEmail)
		await enrollTotp(cookie)

		// Sanity: while enrolled, mobile sign-in returns a challengeToken.
		const challengedRes = await postSignIn()
		expect(challengedRes.status).toBe(200)
		const challengedBody = (await challengedRes.json()) as { apiKey?: string; challengeToken?: string }
		expect(challengedBody.apiKey).toBeUndefined()
		expect(typeof challengedBody.challengeToken).toBe('string')

		await disableTotp(cookie)

		// After disable, sign-in mints the apiKey directly with no challenge.
		const directRes = await postSignIn()
		expect(directRes.status).toBe(200)
		const directBody = (await directRes.json()) as { apiKey?: string; challengeToken?: string }
		expect(typeof directBody.apiKey).toBe('string')
		expect(directBody.apiKey!.length).toBeGreaterThan(20)
		expect(directBody.challengeToken).toBeUndefined()
	})

	it('re-enabling produces a new secret distinct from the first enrollment', async () => {
		await enableMobileApp(true)
		const { cookie } = await signUpAndGetCookie(testEmail)
		const secret1 = await enrollTotp(cookie)
		await disableTotp(cookie)
		const secret2 = await enrollTotp(cookie)

		expect(secret1).not.toBe(secret2)
		// Both should be reasonable-length base32 strings.
		expect(secret1).toMatch(/^[A-Z2-7]{16,}$/)
		expect(secret2).toMatch(/^[A-Z2-7]{16,}$/)
	})

	it('the re-enrolled secret produces codes that the post-disable sign-in challenge accepts', async () => {
		await enableMobileApp(true)
		const { cookie } = await signUpAndGetCookie(testEmail)
		await enrollTotp(cookie)
		await disableTotp(cookie)
		const secret2 = await enrollTotp(cookie)

		// After re-enroll, sign-in goes through the TOTP fork again.
		const challengedRes = await postSignIn()
		const challengedBody = (await challengedRes.json()) as { challengeToken: string }
		expect(typeof challengedBody.challengeToken).toBe('string')

		const verifyRes = await mobileApp.fetch(
			new Request('http://t/api/mobile/v1/auth/totp/verify', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ challengeToken: challengedBody.challengeToken, code: generateTotp(secret2) }),
			})
		)
		expect(verifyRes.status).toBe(200)
		const verifyBody = (await verifyRes.json()) as { apiKey: string }
		expect(typeof verifyBody.apiKey).toBe('string')
	})
})
