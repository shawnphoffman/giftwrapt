import { vi } from 'vitest'

import type { SchemaDatabase } from '@/db'

// Replace the production @/db singleton with the per-worker pglite instance.
// vi.mock is hoisted, but the async factory waits for migrations to finish
// before resolving the module, so consumers see a ready DB the first time
// they import @/db.
vi.mock('@/db', async () => {
	const mod = await import('./pglite-db')
	await mod.ready
	return { db: mod.testDb }
})

// Stub out storage cleanup. Production hits S3 best-effort; integration
// tests assert the call shape (arguments) without booting an S3 mock.
vi.mock('@/lib/storage/cleanup', () => ({
	cleanupImageUrls: vi.fn(async () => {}),
}))

const ROLLBACK_SENTINEL = Symbol('rollback-sentinel')

// Wraps a test body in a transaction that always rolls back, so each test
// observes a freshly-migrated empty DB regardless of order. Pglite supports
// nested savepoints, so impls that open their own transactions inside `tx`
// still work.
export async function withRollback<T>(fn: (tx: SchemaDatabase) => Promise<T>): Promise<T> {
	const { testDb, ready } = await import('./pglite-db')
	await ready
	let captured: T
	try {
		await testDb.transaction(async tx => {
			captured = await fn(tx as unknown as SchemaDatabase)
			throw ROLLBACK_SENTINEL
		})
	} catch (err) {
		if (err !== ROLLBACK_SENTINEL) throw err
	}
	// captured is only unassigned if fn threw before completing, in which case
	// the catch block above re-threw and we never reach this line.
	return captured!
}
