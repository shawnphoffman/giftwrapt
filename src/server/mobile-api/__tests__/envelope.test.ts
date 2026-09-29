// Unit tests for the verbose error envelope helpers. Exercises:
//   - buildError default shape and message resolution
//   - jsonError emits a Response with the right status + JSON body
//
// Integration tests against `mobileApp.fetch(...)` live in
// `mobile-api.smoke.integration.test.ts`.

import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import { buildError, jsonError } from '../envelope'

describe('buildError', () => {
	it('uses the default message for known codes', () => {
		const env = buildError('not-found')
		expect(env).toEqual({
			error: { code: 'not-found', message: 'Not found.' },
		})
	})

	it('omits data when not provided', () => {
		const env = buildError('rate-limited')
		expect(env.error.data).toBeUndefined()
	})

	it('includes data when provided', () => {
		const env = buildError('rate-limited', { data: { retryAfterSeconds: 2 } })
		expect(env.error.data).toEqual({ retryAfterSeconds: 2 })
	})

	it('falls back to a generic message for unknown codes', () => {
		const env = buildError('totally-unknown-code')
		expect(env.error.code).toBe('totally-unknown-code')
		expect(env.error.message).toBe('Request failed.')
	})

	it('honors a caller-supplied message override', () => {
		const env = buildError('not-found', { message: 'Custom copy.' })
		expect(env.error.message).toBe('Custom copy.')
	})
})

describe('jsonError', () => {
	it('returns a JSON Response with the right status and verbose envelope', async () => {
		const app = new Hono()
		app.get('/x', c => jsonError(c, 429, 'rate-limited', { data: { retryAfterSeconds: 1 } }))

		const res = await app.fetch(new Request('http://t/x'))
		expect(res.status).toBe(429)
		expect(res.headers.get('content-type')).toMatch(/application\/json/)
		const body = (await res.json()) as { error: { code: string; message: string; data?: { retryAfterSeconds: number } } }
		expect(body.error.code).toBe('rate-limited')
		expect(body.error.data?.retryAfterSeconds).toBe(1)
	})
})
