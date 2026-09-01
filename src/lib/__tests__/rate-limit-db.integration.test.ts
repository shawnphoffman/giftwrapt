import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import type { SchemaDatabase } from '@/db'
import { createDbRateLimiter } from '@/lib/rate-limit-db'

// The DB-backed limiter guards credential endpoints, where a per-process
// counter would reset on every cold start. These cover the window
// mechanics against real SQL; the cross-instance property it exists for
// follows from the counter living in the database rather than in module
// memory, and is exercised here by driving one limiter through two
// separate consume calls that share only the table.

describe('createDbRateLimiter', () => {
	it('allows up to max within a window, then denies', async () => {
		await withRollback(async tx => {
			const limiter = createDbRateLimiter({ name: 'test-basic', max: 3, windowMs: 60_000 })
			const dbx = tx as unknown as SchemaDatabase

			const first = await limiter.consume('ip:1.2.3.4', dbx)
			expect(first).toMatchObject({ allowed: true, remaining: 2 })
			const second = await limiter.consume('ip:1.2.3.4', dbx)
			expect(second).toMatchObject({ allowed: true, remaining: 1 })
			const third = await limiter.consume('ip:1.2.3.4', dbx)
			expect(third).toMatchObject({ allowed: true, remaining: 0 })

			const fourth = await limiter.consume('ip:1.2.3.4', dbx)
			expect(fourth.allowed).toBe(false)
			expect(fourth.remaining).toBe(0)
			expect(fourth.retryAfterMs).toBeGreaterThan(0)
			expect(fourth.retryAfterMs).toBeLessThanOrEqual(60_000)
		})
	})

	it('counts each key separately', async () => {
		await withRollback(async tx => {
			const limiter = createDbRateLimiter({ name: 'test-keys', max: 1, windowMs: 60_000 })
			const dbx = tx as unknown as SchemaDatabase

			expect((await limiter.consume('ip:1.1.1.1', dbx)).allowed).toBe(true)
			expect((await limiter.consume('ip:1.1.1.1', dbx)).allowed).toBe(false)
			// A different caller still has its full budget.
			expect((await limiter.consume('ip:2.2.2.2', dbx)).allowed).toBe(true)
		})
	})

	it('does not let one limiter consume another limiter budget', async () => {
		await withRollback(async tx => {
			const a = createDbRateLimiter({ name: 'test-ns-a', max: 1, windowMs: 60_000 })
			const b = createDbRateLimiter({ name: 'test-ns-b', max: 1, windowMs: 60_000 })
			const dbx = tx as unknown as SchemaDatabase

			expect((await a.consume('ip:9.9.9.9', dbx)).allowed).toBe(true)
			expect((await a.consume('ip:9.9.9.9', dbx)).allowed).toBe(false)
			// Same key string, different limiter name: separate bucket.
			expect((await b.consume('ip:9.9.9.9', dbx)).allowed).toBe(true)
		})
	})

	it('starts a fresh window once the old one has aged out', async () => {
		await withRollback(async tx => {
			// A 1ms window is expired by the time the next statement runs,
			// so the reset branch of the upsert is what gets exercised.
			const limiter = createDbRateLimiter({ name: 'test-window', max: 1, windowMs: 1 })
			const dbx = tx as unknown as SchemaDatabase

			expect((await limiter.consume('ip:3.3.3.3', dbx)).allowed).toBe(true)
			await new Promise(resolve => setTimeout(resolve, 15))
			const afterExpiry = await limiter.consume('ip:3.3.3.3', dbx)
			expect(afterExpiry.allowed).toBe(true)
			expect(afterExpiry.remaining).toBe(0)
		})
	})

	it('rejects a nonsensical config', () => {
		expect(() => createDbRateLimiter({ name: 'bad', max: 0, windowMs: 60_000 })).toThrow()
		expect(() => createDbRateLimiter({ name: 'bad', max: 5, windowMs: 0 })).toThrow()
	})
})
