// End-to-end smoke tests for the mobile passkey sign-in flow.
//
// We can't fully simulate a WebAuthn authenticator in vitest without
// pulling in @simplewebauthn/server's signing primitives, so the
// "happy path" here only exercises:
//
//   1. /v1/auth/passkey/begin returns `{ challengeToken, ttlSeconds,
//      publicKey }` with a non-trivial challenge.
//   2. /v1/auth/passkey/finish with an unknown token returns
//      `invalid-challenge` (single-use semantics).
//   3. /v1/auth/passkey/finish with a token from begin but a forged
//      WebAuthn assertion gets rejected as `invalid-code` AND the
//      token is consumed (replay returns `invalid-challenge`).
//
// The cryptographic happy path - "valid assertion mints an apiKey" -
// is covered by better-auth's own test suite plus iOS's WebAuthn
// integration; we just confirm the wire glue here.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { appSettings } from '@/db/schema'
import { mobileSignInLimiter } from '@/lib/rate-limits'

import { mobileApp } from '../app'

async function enableMobileApp(enabled: boolean): Promise<void> {
	await db
		.insert(appSettings)
		.values({ key: 'enableMobileApp', value: enabled })
		.onConflictDoUpdate({ target: appSettings.key, set: { value: enabled } })
}

async function postPasskeyBegin(body: unknown = {}): Promise<Response> {
	return mobileApp.fetch(
		new Request('http://t/api/mobile/v1/auth/passkey/begin', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		})
	)
}

async function postPasskeyFinish(body: unknown): Promise<Response> {
	return mobileApp.fetch(
		new Request('http://t/api/mobile/v1/auth/passkey/finish', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		})
	)
}

describe('mobile sign-in: passkey', () => {
	beforeEach(() => {
		mobileSignInLimiter._resetForTesting()
	})

	afterEach(() => {
		mobileSignInLimiter._resetForTesting()
	})

	it('begin returns the documented challenge envelope', async () => {
		await enableMobileApp(true)
		const res = await postPasskeyBegin({})
		expect(res.status).toBe(200)
		const body = (await res.json()) as {
			challengeToken: string
			ttlSeconds: number
			publicKey: { challenge?: unknown; rpId?: unknown; allowCredentials?: unknown }
		}
		expect(typeof body.challengeToken).toBe('string')
		expect(body.challengeToken.length).toBeGreaterThan(20)
		expect(body.ttlSeconds).toBeGreaterThan(0)
		// The exact field names depend on better-auth's WebAuthn options
		// shape; just confirm we got back a non-empty options object.
		expect(typeof body.publicKey).toBe('object')
		expect(Object.keys(body.publicKey).length).toBeGreaterThan(0)
	})

	it('finish with an unknown challengeToken returns invalid-challenge', async () => {
		await enableMobileApp(true)
		const res = await postPasskeyFinish({
			challengeToken: 'totally-bogus',
			deviceName: 'iPhone',
			response: { id: 'fake', type: 'public-key', rawId: 'fake', response: {} },
		})
		expect(res.status).toBe(400)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('invalid-challenge')
	})

	it('finish with a forged assertion fails and burns the token', async () => {
		await enableMobileApp(true)
		const beginRes = await postPasskeyBegin({})
		const beginBody = (await beginRes.json()) as { challengeToken: string }
		expect(beginBody.challengeToken).toBeDefined()

		const finishRes = await postPasskeyFinish({
			challengeToken: beginBody.challengeToken,
			deviceName: 'My iPhone',
			// Better-auth's verifyPasskeyAuthentication will reject
			// unrecognized credentials. The exact error code depends
			// on the WebAuthn library, but the response should be a
			// non-2xx that our handler maps to 401 invalid-code.
			response: {
				id: 'AAA',
				type: 'public-key',
				rawId: 'AAA',
				response: {
					clientDataJSON: '',
					authenticatorData: '',
					signature: '',
				},
			},
		})
		// Either 400 invalid-input (zod failure on the response shape)
		// or 401 invalid-code (better-auth rejection). The helper's
		// envelope is uniform either way.
		expect([400, 401]).toContain(finishRes.status)

		// Single-use: replaying the token even with the same forged
		// assertion now returns invalid-challenge.
		const replayRes = await postPasskeyFinish({
			challengeToken: beginBody.challengeToken,
			deviceName: 'iPhone',
			response: { id: 'AAA', type: 'public-key', rawId: 'AAA', response: {} },
		})
		expect(replayRes.status).toBe(400)
		const replayBody = (await replayRes.json()) as { error: { code: string } }
		expect(replayBody.error.code).toBe('invalid-challenge')
	})

	it('finish with a malformed body returns invalid-input', async () => {
		await enableMobileApp(true)
		const res = await postPasskeyFinish({
			// missing challengeToken + deviceName + response
		})
		expect(res.status).toBe(400)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('invalid-input')
	})
})
