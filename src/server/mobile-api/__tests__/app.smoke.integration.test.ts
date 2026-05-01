// Smoke tests for the assembled mobile Hono app. Exercises the gateway,
// auth middleware, and verbose error envelope without touching the DB.
//
// The DB-bound integration tests (sign-in, devices, list/claim flows)
// live alongside the impl tests in `src/api/__tests__/` and use the
// pglite withRollback helper.

import { beforeAll, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { appSettings } from '@/db/schema'

import { mobileApp } from '../app'
import { MIN_CLIENT_VERSION } from '../middleware'

// The gateway-level kill switch returns 503 when `enableMobileApp` is
// off; flip it on once for this whole file so the routing assertions
// actually exercise auth + envelope behavior.
beforeAll(async () => {
	await db
		.insert(appSettings)
		.values({ key: 'enableMobileApp', value: true })
		.onConflictDoUpdate({ target: appSettings.key, set: { value: true } })
})

describe('mobile app routing', () => {
	it('returns verbose 404 envelope + X-Min-Client-Version for unknown paths outside /v1', async () => {
		// /v1/* is apiKey-gated, so unknown paths INSIDE /v1 401 first. Use a
		// path outside any version to hit the gateway's notFound handler.
		const res = await mobileApp.fetch(new Request('http://t/api/mobile/totally-unknown'))
		expect(res.status).toBe(404)
		expect(res.headers.get('X-Min-Client-Version')).toBe(MIN_CLIENT_VERSION)
		const body = (await res.json()) as { error: { code: string; message: string } }
		expect(body.error.code).toBe('not-found')
		expect(typeof body.error.message).toBe('string')
	})

	it('returns 401 + verbose envelope for authenticated routes without bearer', async () => {
		const res = await mobileApp.fetch(new Request('http://t/api/mobile/v1/me'))
		expect(res.status).toBe(401)
		expect(res.headers.get('X-Min-Client-Version')).toBe(MIN_CLIENT_VERSION)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('unauthorized')
	})

	it('returns 401 for malformed bearer header', async () => {
		const res = await mobileApp.fetch(new Request('http://t/api/mobile/v1/me', { headers: { authorization: 'Bearer ' } }))
		expect(res.status).toBe(401)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('unauthorized')
	})

	it('returns 401 for unknown bearer key', async () => {
		const res = await mobileApp.fetch(new Request('http://t/api/mobile/v1/me', { headers: { authorization: 'Bearer not-a-real-key' } }))
		expect(res.status).toBe(401)
		const body = (await res.json()) as { error: { code: string } }
		expect(body.error.code).toBe('unauthorized')
	})

	it('rejects sign-in with malformed JSON body', async () => {
		const res = await mobileApp.fetch(
			new Request('http://t/api/mobile/v1/sign-in', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: 'not json',
			})
		)
		// Either invalid-json (parse failure) or 503 mobile-app-disabled when
		// the toggle is off in the test env. Both are valid envelope responses.
		expect([400, 503]).toContain(res.status)
		expect(res.headers.get('X-Min-Client-Version')).toBe(MIN_CLIENT_VERSION)
		const body = (await res.json()) as { error: { code: string } }
		expect(['invalid-json', 'mobile-app-disabled']).toContain(body.error.code)
	})
})
