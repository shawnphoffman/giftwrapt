// Wire-contract tests for the mobile OIDC sign-in flow.
//
// The flow itself is a stub today: `auth.ts` doesn't load
// better-auth's `genericOAuth` plugin, so no external providers are
// configured and every begin/finish call rejects with
// `unknown-provider`. These tests pin the wire shape so iOS can ship
// the OIDC code path now and have it light up automatically when an
// operator wires a provider in `auth.ts`.

import { beforeEach, describe, expect, it } from 'vitest'

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

describe('mobile sign-in: OIDC (wire stub)', () => {
	beforeEach(async () => {
		mobileSignInLimiter._resetForTesting()
		await enableMobileApp(true)
	})

	it('begin returns unknown-provider when no providers are configured', async () => {
		const res = await postOidcBegin({ providerId: 'google', deviceName: 'iPhone' })
		expect(res.status).toBe(404)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('unknown-provider')
	})

	it('begin rejects malformed body with invalid-input', async () => {
		const res = await postOidcBegin({ providerId: '' })
		expect(res.status).toBe(400)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('invalid-input')
	})

	it('finish returns unknown-provider for any unrecognized providerId', async () => {
		const res = await postOidcFinish({
			challengeToken: 'whatever',
			providerId: 'google',
			code: 'code',
			state: 'state',
		})
		expect(res.status).toBe(404)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('unknown-provider')
	})

	it('finish rejects malformed body with invalid-input', async () => {
		const res = await postOidcFinish({})
		expect(res.status).toBe(400)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('invalid-input')
	})

	it('capabilities probe surfaces an empty oidc list until providers are wired', async () => {
		const res = await mobileApp.fetch(new Request('http://t/api/mobile/v1/auth/capabilities'))
		expect(res.status).toBe(200)
		const body = (await res.json()) as { oidc: Array<unknown> }
		expect(body.oidc).toEqual([])
	})
})
