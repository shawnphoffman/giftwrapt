// Unit tests for the cross-cutting Hono middleware:
//   - X-Min-Client-Version header on every response
//   - Rate-limit converter that emits the locked-in 429 + Retry-After
//     shape with the verbose error envelope.

import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import { createRateLimiter } from '@/lib/rate-limit'

import { MIN_CLIENT_VERSION, minClientVersionHeader, rateLimit } from '../middleware'

describe('minClientVersionHeader', () => {
	it('sets X-Min-Client-Version on success responses', async () => {
		const app = new Hono()
		app.use('*', minClientVersionHeader)
		app.get('/ok', c => c.json({ ok: true }))

		const res = await app.fetch(new Request('http://t/ok'))
		expect(res.status).toBe(200)
		expect(res.headers.get('X-Min-Client-Version')).toBe(MIN_CLIENT_VERSION)
	})

	it('sets X-Min-Client-Version on 404 responses', async () => {
		const app = new Hono()
		app.use('*', minClientVersionHeader)
		app.notFound(c => c.json({ error: 'nope' }, 404))

		const res = await app.fetch(new Request('http://t/missing'))
		expect(res.status).toBe(404)
		expect(res.headers.get('X-Min-Client-Version')).toBe(MIN_CLIENT_VERSION)
	})
})

describe('rateLimit middleware', () => {
	it('passes through when under the cap', async () => {
		const limiter = createRateLimiter({ name: 'test-pass', max: 5, windowMs: 60_000 })
		const app = new Hono()
		app.use('*', rateLimit(limiter))
		app.get('/x', c => c.json({ ok: true }))

		const res = await app.fetch(new Request('http://t/x', { headers: { 'x-forwarded-for': '1.1.1.1' } }))
		expect(res.status).toBe(200)
	})

	it('emits 429 with Retry-After header and verbose envelope when over the cap', async () => {
		const limiter = createRateLimiter({ name: 'test-deny', max: 1, windowMs: 60_000 })
		const app = new Hono()
		app.use('*', rateLimit(limiter))
		app.get('/x', c => c.json({ ok: true }))

		const headers = { 'x-forwarded-for': '2.2.2.2' }
		const ok = await app.fetch(new Request('http://t/x', { headers }))
		expect(ok.status).toBe(200)

		const denied = await app.fetch(new Request('http://t/x', { headers }))
		expect(denied.status).toBe(429)
		const retryAfter = denied.headers.get('Retry-After')
		expect(retryAfter).not.toBeNull()
		expect(Number(retryAfter)).toBeGreaterThan(0)
		const body = (await denied.json()) as { error: { code: string; data?: { retryAfterSeconds: number } } }
		expect(body.error.code).toBe('rate-limited')
		expect(body.error.data?.retryAfterSeconds).toBeGreaterThan(0)
	})
})
