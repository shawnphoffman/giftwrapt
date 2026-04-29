import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createRateLimiter, RateLimitError, rateLimitKeyForRequest } from '../rate-limit'

describe('createRateLimiter', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date('2026-04-28T00:00:00Z'))
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	it('allows up to `max` calls per window then blocks', () => {
		const lim = createRateLimiter({ name: 'test', max: 3, windowMs: 60_000 })
		expect(lim.consume('a').allowed).toBe(true)
		expect(lim.consume('a').allowed).toBe(true)
		expect(lim.consume('a').allowed).toBe(true)
		const blocked = lim.consume('a')
		expect(blocked.allowed).toBe(false)
		expect(blocked.retryAfterMs).toBeGreaterThan(0)
	})

	it('counts each key independently', () => {
		const lim = createRateLimiter({ name: 'test', max: 1, windowMs: 60_000 })
		expect(lim.consume('a').allowed).toBe(true)
		expect(lim.consume('b').allowed).toBe(true)
		expect(lim.consume('a').allowed).toBe(false)
	})

	it('resets the window after windowMs has passed', () => {
		const lim = createRateLimiter({ name: 'test', max: 2, windowMs: 60_000 })
		expect(lim.consume('a').allowed).toBe(true)
		expect(lim.consume('a').allowed).toBe(true)
		expect(lim.consume('a').allowed).toBe(false)
		vi.advanceTimersByTime(60_001)
		expect(lim.consume('a').allowed).toBe(true)
	})

	it('reports decreasing `remaining` within a window', () => {
		const lim = createRateLimiter({ name: 'test', max: 5, windowMs: 60_000 })
		expect(lim.consume('a').remaining).toBe(4)
		expect(lim.consume('a').remaining).toBe(3)
		expect(lim.consume('a').remaining).toBe(2)
	})

	it('rejects nonsense config', () => {
		expect(() => createRateLimiter({ name: 'x', max: 0, windowMs: 100 })).toThrow()
		expect(() => createRateLimiter({ name: 'x', max: 1, windowMs: 0 })).toThrow()
	})
})

describe('RateLimitError', () => {
	it('carries the limiter name and retryAfterMs', () => {
		const e = new RateLimitError('comments', 1234)
		expect(e.limiterName).toBe('comments')
		expect(e.retryAfterMs).toBe(1234)
		expect(e.message).toContain('comments')
	})
})

describe('rateLimitKeyForRequest', () => {
	function r(headers: Record<string, string> = {}): Request {
		return new Request('http://localhost/x', { headers })
	}

	it('prefers user id when present', () => {
		expect(rateLimitKeyForRequest(r(), 'user-1')).toBe('user:user-1')
		// Even when an IP header is set:
		expect(rateLimitKeyForRequest(r({ 'x-forwarded-for': '1.1.1.1' }), 'user-1')).toBe('user:user-1')
	})

	it('uses x-forwarded-for first hop', () => {
		expect(rateLimitKeyForRequest(r({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('ip:1.2.3.4')
	})

	it('falls back to x-real-ip', () => {
		expect(rateLimitKeyForRequest(r({ 'x-real-ip': '9.9.9.9' }))).toBe('ip:9.9.9.9')
	})

	it('falls back to "unknown" when neither header is present', () => {
		expect(rateLimitKeyForRequest(r())).toBe('ip:unknown')
	})
})
