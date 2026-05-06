// Wire-contract tests for the mobile OIDC sign-in flow.
//
// The full IdP round trip can't be exercised in vitest (no real IdP),
// so these tests pin the wire shape and the front-half / back-half
// validation logic:
//
//   - capabilities probe surfaces the OIDC provider when configured
//   - begin returns `{ challengeToken, ttlSeconds, signInUrl }` when
//     redirectUri is on the whitelist
//   - begin rejects unconfigured deployments with `oidc-not-configured`
//   - begin rejects unwhitelisted redirect URIs with `redirect-not-allowed`
//   - finish returns `invalid-challenge` for any unknown / unconsumed
//     token
//
// The actual `_jump` -> IdP -> `_native-done` -> `redirectUri` chain
// is the responsibility of better-auth's `genericOAuth` plugin and
// the configured IdP; we just confirm the wire glue.

import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { appSettings } from '@/db/schema'
import { mobileSignInLimiter } from '@/lib/rate-limits'
import { encryptOidcClientSecrets } from '@/lib/settings-loader'

import { mobileApp } from '../app'

const REDIRECT_URI = 'com.shawnhoffman.wishlists://oauth'

async function enableMobileApp(enabled: boolean): Promise<void> {
	await db
		.insert(appSettings)
		.values({ key: 'enableMobileApp', value: enabled })
		.onConflictDoUpdate({ target: appSettings.key, set: { value: enabled } })
}

async function setOidcConfig(
	overrides: Partial<{
		enabled: boolean
		clientId: string
		clientSecret: string
		issuerUrl: string
		mobileRedirectUris: Array<string>
		buttonText: string
	}>
): Promise<void> {
	const value = encryptOidcClientSecrets({
		enabled: overrides.enabled ?? true,
		issuerUrl: overrides.issuerUrl ?? 'https://idp.test/realm',
		authorizationUrl: '',
		tokenUrl: '',
		userinfoUrl: '',
		jwksUrl: '',
		logoutUrl: '',
		clientId: overrides.clientId ?? 'test-client-id',
		clientSecret: overrides.clientSecret ?? 'test-client-secret',
		scopes: [],
		buttonText: overrides.buttonText ?? '',
		matchExistingUsersBy: 'none',
		autoRegister: true,
		mobileRedirectUris: overrides.mobileRedirectUris ?? [REDIRECT_URI],
	})
	await db.insert(appSettings).values({ key: 'oidcClient', value }).onConflictDoUpdate({ target: appSettings.key, set: { value } })
}

async function clearOidcConfig(): Promise<void> {
	await db.delete(appSettings).where(eq(appSettings.key, 'oidcClient'))
}

async function postOidcBegin(body: unknown): Promise<Response> {
	return mobileApp.fetch(
		new Request('http://t/api/mobile/v1/auth/oidc/begin', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		})
	)
}

async function postOidcFinish(body: unknown): Promise<Response> {
	return mobileApp.fetch(
		new Request('http://t/api/mobile/v1/auth/oidc/finish', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		})
	)
}

describe('mobile sign-in: OIDC', () => {
	beforeEach(async () => {
		mobileSignInLimiter._resetForTesting()
		await enableMobileApp(true)
	})

	afterEach(async () => {
		await clearOidcConfig()
	})

	it('capabilities surfaces nothing when no provider is configured', async () => {
		await clearOidcConfig()
		const res = await mobileApp.fetch(new Request('http://t/api/mobile/v1/auth/capabilities'))
		expect(res.status).toBe(200)
		const body = (await res.json()) as { oidc: Array<unknown> }
		expect(body.oidc).toEqual([])
	})

	it('capabilities surfaces the configured provider with its button text', async () => {
		await setOidcConfig({ buttonText: 'Sign in with Pocket ID' })
		const res = await mobileApp.fetch(new Request('http://t/api/mobile/v1/auth/capabilities'))
		expect(res.status).toBe(200)
		const body = (await res.json()) as {
			oidc: Array<{ id: string; label: string; kind: string }>
		}
		expect(body.oidc).toHaveLength(1)
		expect(body.oidc[0]).toEqual({ id: 'oidc', label: 'Sign in with Pocket ID', kind: 'generic' })
	})

	it('begin rejects unconfigured deployments with oidc-not-configured', async () => {
		await clearOidcConfig()
		const res = await postOidcBegin({ deviceName: 'iPhone', redirectUri: REDIRECT_URI })
		expect(res.status).toBe(404)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('oidc-not-configured')
	})

	it('begin rejects redirect URIs not on the admin whitelist', async () => {
		await setOidcConfig({})
		const res = await postOidcBegin({ deviceName: 'iPhone', redirectUri: 'evil://oauth' })
		expect(res.status).toBe(400)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('redirect-not-allowed')
	})

	it('begin returns the documented envelope on the happy front-half', async () => {
		await setOidcConfig({})
		const res = await postOidcBegin({ deviceName: 'My iPhone', redirectUri: REDIRECT_URI })
		expect(res.status).toBe(200)
		const body = (await res.json()) as {
			challengeToken: string
			ttlSeconds: number
			signInUrl: string
		}
		expect(typeof body.challengeToken).toBe('string')
		expect(body.challengeToken.length).toBeGreaterThan(20)
		expect(body.ttlSeconds).toBeGreaterThan(0)
		expect(body.signInUrl).toMatch(/\/api\/mobile\/v1\/auth\/oidc\/_jump\?token=/u)
	})

	it('begin rejects malformed bodies with invalid-input', async () => {
		await setOidcConfig({})
		const res = await postOidcBegin({ deviceName: '', redirectUri: REDIRECT_URI })
		expect(res.status).toBe(400)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('invalid-input')
	})

	it('finish rejects an unknown challengeToken with invalid-challenge', async () => {
		const res = await postOidcFinish({ challengeToken: 'totally-bogus' })
		expect(res.status).toBe(400)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('invalid-challenge')
	})

	it('finish rejects a not-yet-completed challenge token with invalid-challenge', async () => {
		await setOidcConfig({})
		const beginRes = await postOidcBegin({ deviceName: 'iPhone', redirectUri: REDIRECT_URI })
		const { challengeToken } = (await beginRes.json()) as { challengeToken: string }

		// Calling finish before _native-done has run the IdP round
		// trip means the row is still in the `oidc-init` shape, which
		// `consumePending('oidc-result')` won't match.
		const res = await postOidcFinish({ challengeToken })
		expect(res.status).toBe(400)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('invalid-challenge')
	})

	it('finish rejects malformed bodies with invalid-input', async () => {
		const res = await postOidcFinish({})
		expect(res.status).toBe(400)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('invalid-input')
	})
})
