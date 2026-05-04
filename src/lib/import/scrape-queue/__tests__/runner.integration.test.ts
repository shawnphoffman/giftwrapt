import { eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/db'
import { appSettings, items, itemScrapeJobs } from '@/db/schema'

import { makeList, makeUser } from '../../../../../test/integration/factories'
import { withRollback } from '../../../../../test/integration/setup'

// Stub `runOneShotScrape` so tests don't need network access. The mock
// is reconfigured per-test via mockImplementation.
const scrapeMock = vi.fn()
vi.mock('@/lib/scrapers/run', () => ({
	runOneShotScrape: (...args: Array<unknown>) => scrapeMock(...args),
}))

// Stub the SSE notifier to avoid pulling in the full route module (which
// imports from server-only paths in some bundler contexts).
vi.mock('@/routes/api/sse/list.$listId', () => ({
	notifyListChange: vi.fn(),
}))

// Storage mirror is gated on the setting; we leave the default off but
// stub anyway to avoid network/storage I/O on the off-path.
vi.mock('@/lib/storage/mirror', () => ({
	mirrorRemoteImageToStorage: vi.fn(async () => null),
}))

// Imported AFTER mocks are registered so the runner picks up the stubs.
const { enqueueScrapeJob, processForUser } = await import('../runner')

async function setImportEnabled(tx: any, enabled: boolean) {
	await tx
		.insert(appSettings)
		.values({ key: 'importEnabled', value: enabled })
		.onConflictDoUpdate({ target: appSettings.key, set: { value: enabled } })
}

async function setMaxAttempts(tx: any, n: number) {
	await tx
		.insert(appSettings)
		.values({ key: 'scrapeQueueMaxAttempts', value: n })
		.onConflictDoUpdate({ target: appSettings.key, set: { value: n } })
}

async function setConcurrency(tx: any, n: number) {
	await tx
		.insert(appSettings)
		.values({ key: 'scrapeQueueConcurrency', value: n })
		.onConflictDoUpdate({ target: appSettings.key, set: { value: n } })
}

beforeEach(() => {
	scrapeMock.mockReset()
})

describe('enqueueScrapeJob', () => {
	it('inserts a pending job for a fresh itemId', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id })
			const [item] = await tx.insert(items).values({ listId: list.id, title: 'untitled', url: 'https://example.com/a' }).returning()

			const r = await enqueueScrapeJob(tx, { itemId: item.id, userId: user.id, url: 'https://example.com/a' })
			expect(r.kind).toBe('enqueued')

			const rows = await tx.select().from(itemScrapeJobs).where(eq(itemScrapeJobs.itemId, item.id))
			expect(rows).toHaveLength(1)
			expect(rows[0].status).toBe('pending')
			expect(rows[0].url).toBe('https://example.com/a')
		})
	})

	it('is idempotent: a second enqueue for the same itemId no-ops', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id })
			const [item] = await tx.insert(items).values({ listId: list.id, title: 'untitled', url: 'https://example.com/b' }).returning()

			const a = await enqueueScrapeJob(tx, { itemId: item.id, userId: user.id, url: 'https://example.com/b' })
			const b = await enqueueScrapeJob(tx, { itemId: item.id, userId: user.id, url: 'https://example.com/b' })
			expect(a.kind).toBe('enqueued')
			expect(b.kind).toBe('already-pending')

			const rows = await tx.select().from(itemScrapeJobs).where(eq(itemScrapeJobs.itemId, item.id))
			expect(rows).toHaveLength(1)
		})
	})
})

describe('processForUser - skip states', () => {
	it('skips with reason "disabled" when importEnabled is false', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			await setImportEnabled(tx, false)

			const r = await processForUser(tx as unknown as Database, user.id, { trigger: 'manual' })
			expect(r.status).toBe('skipped')
			if (r.status === 'skipped') expect(r.reason).toBe('disabled')
		})
	})

	it('skips with reason "no-jobs" when the user has no pending+ready jobs', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			await setImportEnabled(tx, true)

			const r = await processForUser(tx as unknown as Database, user.id, { trigger: 'manual' })
			expect(r.status).toBe('skipped')
			if (r.status === 'skipped') expect(r.reason).toBe('no-jobs')
		})
	})
})

describe('processForUser - success path', () => {
	it('fills empty title/image/price/notes from the scrape result', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id })
			const [item] = await tx.insert(items).values({ listId: list.id, title: 'example.com', url: 'https://example.com/x' }).returning()
			await setImportEnabled(tx, true)
			await tx.insert(itemScrapeJobs).values({ itemId: item.id, userId: user.id, url: 'https://example.com/x' })

			scrapeMock.mockResolvedValueOnce({
				kind: 'ok',
				fromProvider: 'fetch',
				attempts: [],
				cached: false,
				result: {
					title: 'Real Product Name',
					price: '$19.99',
					currency: 'USD',
					description: 'a great product',
					imageUrls: ['http://cdn.example.com/img.jpg'],
					finalUrl: 'https://example.com/x',
				},
			})

			const r = await processForUser(tx as unknown as Database, user.id, { trigger: 'manual' })
			expect(r.status).toBe('success')
			if (r.status === 'success') {
				expect(r.processed).toBe(1)
				expect(r.succeeded).toBe(1)
			}

			const updated = await tx.query.items.findFirst({ where: eq(items.id, item.id) })
			expect(updated?.title).toBe('Real Product Name')
			expect(updated?.price).toBe('$19.99')
			expect(updated?.imageUrl).toBe('https://cdn.example.com/img.jpg') // upgraded to https
			expect(updated?.notes).toBe('a great product')

			const job = await tx.query.itemScrapeJobs.findFirst({ where: eq(itemScrapeJobs.itemId, item.id) })
			expect(job?.status).toBe('success')
			expect(job?.completedAt).not.toBeNull()
		})
	})

	it('does not clobber a user-set title', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id })
			const [item] = await tx.insert(items).values({ listId: list.id, title: 'My Custom Title', url: 'https://example.com/y' }).returning()
			await setImportEnabled(tx, true)
			await tx.insert(itemScrapeJobs).values({ itemId: item.id, userId: user.id, url: 'https://example.com/y' })

			scrapeMock.mockResolvedValueOnce({
				kind: 'ok',
				fromProvider: 'fetch',
				attempts: [],
				cached: false,
				result: { title: 'Scraped Title', imageUrls: [], finalUrl: 'https://example.com/y' },
			})

			await processForUser(tx as unknown as Database, user.id, { trigger: 'manual' })
			const updated = await tx.query.items.findFirst({ where: eq(items.id, item.id) })
			expect(updated?.title).toBe('My Custom Title')
		})
	})
})

describe('processForUser - failure path', () => {
	it('schedules backoff and increments attempts on a retryable failure', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id })
			const [item] = await tx.insert(items).values({ listId: list.id, title: 'untitled', url: 'https://x.test/' }).returning()
			await setImportEnabled(tx, true)
			await setMaxAttempts(tx, 3)
			await tx.insert(itemScrapeJobs).values({ itemId: item.id, userId: user.id, url: 'https://x.test/' })

			scrapeMock.mockRejectedValueOnce(new Error('network down'))

			const r = await processForUser(tx as unknown as Database, user.id, { trigger: 'manual' })
			expect(r.status).toBe('success')
			if (r.status === 'success') expect(r.retriable).toBe(1)

			const job = await tx.query.itemScrapeJobs.findFirst({ where: eq(itemScrapeJobs.itemId, item.id) })
			expect(job?.status).toBe('pending')
			expect(job?.attempts).toBe(1)
			expect(job?.lastError).toContain('network down')
			expect(job?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now())
		})
	})

	it('flips to "failed" once attempts reach the configured max', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id })
			const [item] = await tx.insert(items).values({ listId: list.id, title: 'untitled', url: 'https://x.test/' }).returning()
			await setImportEnabled(tx, true)
			await setMaxAttempts(tx, 1)
			await tx.insert(itemScrapeJobs).values({ itemId: item.id, userId: user.id, url: 'https://x.test/' })

			scrapeMock.mockResolvedValueOnce({ kind: 'error', reason: 'timeout', attempts: [] })

			const r = await processForUser(tx as unknown as Database, user.id, { trigger: 'manual' })
			expect(r.status).toBe('success')
			if (r.status === 'success') expect(r.failed).toBe(1)

			const job = await tx.query.itemScrapeJobs.findFirst({ where: eq(itemScrapeJobs.itemId, item.id) })
			expect(job?.status).toBe('failed')
			expect(job?.attempts).toBe(1)
			expect(job?.lastError).toContain('timeout')
			expect(job?.completedAt).not.toBeNull()
		})
	})

	it('respects the per-tick concurrency limit', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id })
			await setImportEnabled(tx, true)
			await setConcurrency(tx, 2)
			// 5 ready jobs; only 2 should be claimed in one tick.
			for (let i = 0; i < 5; i++) {
				const [item] = await tx
					.insert(items)
					.values({ listId: list.id, title: 'untitled', url: `https://x.test/${i}` })
					.returning()
				await tx.insert(itemScrapeJobs).values({ itemId: item.id, userId: user.id, url: `https://x.test/${i}` })
			}

			scrapeMock.mockResolvedValue({
				kind: 'ok',
				fromProvider: 'fetch',
				attempts: [],
				cached: false,
				result: { title: 'Filled', imageUrls: [], finalUrl: 'https://x.test/' },
			})

			const r = await processForUser(tx as unknown as Database, user.id, { trigger: 'manual' })
			expect(r.status).toBe('success')
			if (r.status === 'success') expect(r.processed).toBe(2)

			const succeeded = await tx.select({ id: itemScrapeJobs.id }).from(itemScrapeJobs).where(eq(itemScrapeJobs.status, 'success'))
			expect(succeeded).toHaveLength(2)
			const stillPending = await tx.select({ id: itemScrapeJobs.id }).from(itemScrapeJobs).where(eq(itemScrapeJobs.status, 'pending'))
			expect(stillPending).toHaveLength(3)
		})
	})
})

// Advisory-lock collision is exercised in production by two concurrent
// connections (a cron tick + a manual run-once for the same user). pglite
// is single-connection, so the same session that holds the lock can
// re-acquire it - we cannot reproduce the cross-connection collision
// inside the rollback transaction. The contract is enforced by:
//
//   1. The runner's `pg_try_advisory_lock` call (verified by inspection;
//      same shape as `intelligence/runner.ts`).
//   2. Real Postgres semantics in production.
//
// Leaving an `it.skip` here so the missing test is visible in the suite
// and a future test runner with two-connection support (testcontainers,
// pgmem, etc) can drop the skip.
describe('processForUser - advisory-lock collision', () => {
	it.skip('returns "lock-held" when the per-user lock is already held (needs real Postgres)', () => {
		void sql // keep import alive; real test goes here.
	})
})
