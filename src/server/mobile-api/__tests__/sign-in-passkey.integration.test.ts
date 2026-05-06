// Wire-contract tests for the mobile passkey sign-in flow.
//
// As of the browser-driven refactor (mirrors the OIDC architecture),
// passkey is structurally identical to OIDC: iOS calls `begin`, opens
// `signInUrl` in `ASWebAuthenticationSession`, and posts `finish` with
// the challenge token to retrieve the standard envelope. The actual
// WebAuthn ceremony runs in Safari against the server's relying party.
//
// The full IdP-equivalent round trip can't be exercised in vitest (no
// real authenticator to drive `navigator.credentials.get`), so we pin
// the wire shape:
//
//   - capabilities probe surfaces `passkey: true` only when the
//     mobile-redirect-URI whitelist is non-empty
//   - begin returns `{ challengeToken, ttlSeconds, signInUrl }` when
//     the redirectUri is on the whitelist
//   - begin rejects unwhitelisted redirect URIs with `redirect-not-allowed`
//   - finish returns `invalid-challenge` for any unknown / unconsumed
//     token

import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { appSettings } from '@/db/schema'
import { mobileSignInLimiter } from '@/lib/rate-limits'
import { encryptOidcClientSecrets } from '@/lib/settings-loader'

import { mobileApp } from '../app'

const REDIRECT_URI = 'wishlists://oauth'

async function enableMobileApp(enabled: boolean): Promise<void> {
	await db
		.insert(appSettings)
		.values({ key: 'enableMobileApp', value: enabled })
		.onConflictDoUpdate({ target: appSettings.key, set: { value: enabled } })
}

async function setMobileRedirectUris(uris: Array<string>): Promise<void> {
	const value = encryptOidcClientSecrets({
		enabled: false,
		issuerUrl: '',
		authorizationUrl: '',
		tokenUrl: '',
		userinfoUrl: '',
		jwksUrl: '',
		logoutUrl: '',
		clientId: '',
		clientSecret: '',
		scopes: [],
		buttonText: '',
		matchExistingUsersBy: 'none',
		autoRegister: true,
		mobileRedirectUris: uris,
	})
	await db.insert(appSettings).values({ key: 'oidcClient', value }).onConflictDoUpdate({ target: appSettings.key, set: { value } })
}

async function clearOidcConfig(): Promise<void> {
	await db.delete(appSettings).where(eq(appSettings.key, 'oidcClient'))
}

async function postPasskeyBegin(body: unknown): Promise<Response> {
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

describe('mobile sign-in: passkey (browser flow)', () => {
	beforeEach(async () => {
		mobileSignInLimiter._resetForTesting()
		await enableMobileApp(true)
	})

	afterEach(async () => {
		await clearOidcConfig()
	})

	it('capabilities reports passkey:false when no mobile redirect URIs are configured', async () => {
		await clearOidcConfig()
		const res = await mobileApp.fetch(new Request('http://t/api/mobile/v1/auth/capabilities'))
		expect(res.status).toBe(200)
		const body = (await res.json()) as { passkey: boolean }
		expect(body.passkey).toBe(false)
	})

	it('capabilities reports passkey:true once the whitelist has any URI', async () => {
		await setMobileRedirectUris([REDIRECT_URI])
		const res = await mobileApp.fetch(new Request('http://t/api/mobile/v1/auth/capabilities'))
		expect(res.status).toBe(200)
		const body = (await res.json()) as { passkey: boolean }
		expect(body.passkey).toBe(true)
	})

	it('begin returns the documented envelope on the happy front-half', async () => {
		await setMobileRedirectUris([REDIRECT_URI])
		const res = await postPasskeyBegin({ deviceName: 'My iPhone', redirectUri: REDIRECT_URI })
		expect(res.status).toBe(200)
		const body = (await res.json()) as { challengeToken: string; ttlSeconds: number; signInUrl: string }
		expect(typeof body.challengeToken).toBe('string')
		expect(body.challengeToken.length).toBeGreaterThan(20)
		expect(body.ttlSeconds).toBeGreaterThan(0)
		expect(body.signInUrl).toMatch(/\/sign-in\/mobile-passkey\?token=/u)
	})

	it('begin rejects unwhitelisted redirect URIs with redirect-not-allowed', async () => {
		await setMobileRedirectUris([REDIRECT_URI])
		const res = await postPasskeyBegin({ deviceName: 'iPhone', redirectUri: 'evil://oauth' })
		expect(res.status).toBe(400)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('redirect-not-allowed')
	})

	it('begin rejects malformed bodies with invalid-input', async () => {
		await setMobileRedirectUris([REDIRECT_URI])
		const res = await postPasskeyBegin({ deviceName: '', redirectUri: REDIRECT_URI })
		expect(res.status).toBe(400)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('invalid-input')
	})

	it('finish rejects an unknown challengeToken with invalid-challenge', async () => {
		const res = await postPasskeyFinish({ challengeToken: 'totally-bogus' })
		expect(res.status).toBe(400)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('invalid-challenge')
	})

	it('finish rejects a not-yet-completed challenge token with invalid-challenge', async () => {
		await setMobileRedirectUris([REDIRECT_URI])
		const beginRes = await postPasskeyBegin({ deviceName: 'iPhone', redirectUri: REDIRECT_URI })
		const { challengeToken } = (await beginRes.json()) as { challengeToken: string }

		// Calling finish before the in-app browser session has run
		// the WebAuthn round trip means the row is still in
		// `browser-init` shape, which `consumePending('browser-result')`
		// won't match.
		const res = await postPasskeyFinish({ challengeToken })
		expect(res.status).toBe(400)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('invalid-challenge')
	})

	it('finish rejects malformed bodies with invalid-input', async () => {
		const res = await postPasskeyFinish({})
		expect(res.status).toBe(400)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('invalid-input')
	})
})
