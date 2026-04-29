import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Module under test reads `env.CRON_SECRET` at call time. Mocked here so
// each test can flip the value without polluting other suites.
let cronSecretValue: string | undefined
vi.mock('@/env', () => ({
	env: {
		get CRON_SECRET() {
			return cronSecretValue
		},
	},
}))

import { checkCronAuth } from '../_auth'

function silentLogger() {
	const noop = () => {}
	const fn = noop as unknown as Parameters<typeof checkCronAuth>[1]
	return new Proxy({} as object, { get: (_, p) => (p === 'child' ? () => fn : noop) }) as Parameters<typeof checkCronAuth>[1]
}

function makeRequest(authHeader?: string): Request {
	const headers = new Headers()
	if (authHeader !== undefined) headers.set('authorization', authHeader)
	return new Request('http://localhost/api/cron/auto-archive', { headers })
}

describe('checkCronAuth', () => {
	beforeEach(() => {
		cronSecretValue = undefined
	})
	afterEach(() => {
		cronSecretValue = undefined
	})

	it('returns 503 when CRON_SECRET is unset (fail-closed)', async () => {
		cronSecretValue = undefined
		const res = checkCronAuth(makeRequest('Bearer anything'), silentLogger())
		expect(res).not.toBeNull()
		expect(res!.status).toBe(503)
		const body = (await res!.json()) as { error: string }
		expect(body.error).toBe('cron-not-configured')
	})

	it('returns 401 when no authorization header is present', async () => {
		cronSecretValue = 'a'.repeat(32)
		const res = checkCronAuth(makeRequest(), silentLogger())
		expect(res).not.toBeNull()
		expect(res!.status).toBe(401)
	})

	it('returns 401 when the bearer token is wrong', async () => {
		cronSecretValue = 'a'.repeat(32)
		const res = checkCronAuth(makeRequest(`Bearer ${'b'.repeat(32)}`), silentLogger())
		expect(res).not.toBeNull()
		expect(res!.status).toBe(401)
	})

	it('returns 401 when the bearer is the right secret but wrong scheme', async () => {
		cronSecretValue = 'a'.repeat(32)
		const res = checkCronAuth(makeRequest('a'.repeat(32)), silentLogger())
		expect(res).not.toBeNull()
		expect(res!.status).toBe(401)
	})

	it('returns 401 when the candidate is shorter than the expected secret', async () => {
		cronSecretValue = 'a'.repeat(32)
		const res = checkCronAuth(makeRequest('Bearer short'), silentLogger())
		expect(res).not.toBeNull()
		expect(res!.status).toBe(401)
	})

	it('returns 401 when the candidate is longer than the expected secret', async () => {
		cronSecretValue = 'a'.repeat(32)
		const res = checkCronAuth(makeRequest(`Bearer ${'a'.repeat(64)}`), silentLogger())
		expect(res).not.toBeNull()
		expect(res!.status).toBe(401)
	})

	it('returns null (authorized) when the bearer token matches', () => {
		cronSecretValue = 'a'.repeat(32)
		const res = checkCronAuth(makeRequest(`Bearer ${'a'.repeat(32)}`), silentLogger())
		expect(res).toBeNull()
	})
})
