import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { appSettings, items, itemScrapeJobs } from '@/db/schema'

import { makeList, makeUser } from '../../../test/integration/factories'
import { withRollback } from '../../../test/integration/setup'

// The impl runs `enqueueScrapeJob`, which only writes a row - no
// network. We do not need to mock `runOneShotScrape` here; the runner
// is exercised in its own integration test.

const { bulkCreateItemsImpl } = await import('../_import-impl')

async function setImportEnabled(tx: any, enabled: boolean) {
	await tx
		.insert(appSettings)
		.values({ key: 'importEnabled', value: enabled })
		.onConflictDoUpdate({ target: appSettings.key, set: { value: enabled } })
}

describe('bulkCreateItemsImpl - happy path', () => {
	it('inserts every draft atomically and enqueues scrape jobs only for items with URLs', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id })
			await setImportEnabled(tx, true)

			const drafts = [
				{ title: 'Plain title item' },
				{ url: 'https://www.amazon.com/dp/B000ABC' },
				{ title: 'Mixed', url: 'https://target.com/p/12345', priority: 'high' as const, quantity: 2 },
			]

			const r = await bulkCreateItemsImpl({
				db: tx as any,
				actor: { id: user.id },
				input: { listId: list.id, items: drafts },
			})

			expect(r.kind).toBe('ok')
			if (r.kind !== 'ok') return
			expect(r.items).toHaveLength(3)
			expect(r.enqueued).toBe(2)

			// Verify invariants on the inserted rows.
			const rows = await tx.select().from(items).where(eq(items.listId, list.id))
			expect(rows).toHaveLength(3)
			for (const row of rows) {
				expect(row.isArchived).toBe(false)
				expect(row.availability).toBe('available')
			}

			// Vendor was derived for known-vendor URLs.
			const amazon = rows.find(r => r.url?.includes('amazon.com'))
			expect(amazon?.vendorId).not.toBeNull()
			expect(amazon?.vendorSource).toBe('rule')

			// Title fallback for URL-only drafts is the hostname.
			expect(amazon?.title).toBe('amazon.com')

			// Items without URLs do not get scrape jobs.
			const titleOnly = rows.find(r => r.title === 'Plain title item')
			expect(titleOnly?.url).toBeNull()
			const titleOnlyJobs = await tx.select().from(itemScrapeJobs).where(eq(itemScrapeJobs.itemId, titleOnly!.id))
			expect(titleOnlyJobs).toHaveLength(0)

			// Items with URLs do.
			const allJobs = await tx.select().from(itemScrapeJobs)
			expect(allJobs).toHaveLength(2)
			for (const job of allJobs) {
				expect(job.status).toBe('pending')
				expect(job.userId).toBe(user.id)
			}
		})
	})

	it('respects priority/quantity overrides on each draft', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id })
			await setImportEnabled(tx, true)

			const r = await bulkCreateItemsImpl({
				db: tx as any,
				actor: { id: user.id },
				input: {
					listId: list.id,
					items: [{ title: 'A', priority: 'high', quantity: 5 }, { title: 'B' }],
				},
			})
			expect(r.kind).toBe('ok')
			if (r.kind !== 'ok') return

			const rows = await tx.select().from(items).where(eq(items.listId, list.id))
			const a = rows.find(r => r.title === 'A')
			const b = rows.find(r => r.title === 'B')
			expect(a?.priority).toBe('high')
			expect(a?.quantity).toBe(5)
			expect(b?.priority).toBe('normal')
			expect(b?.quantity).toBe(1)
		})
	})

	it('handles a 50-item bulk insert', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id })
			await setImportEnabled(tx, true)

			const drafts = Array.from({ length: 50 }, (_, i) => ({ title: `Item ${i}` }))
			const r = await bulkCreateItemsImpl({
				db: tx as any,
				actor: { id: user.id },
				input: { listId: list.id, items: drafts },
			})
			expect(r.kind).toBe('ok')
			if (r.kind !== 'ok') return
			expect(r.items).toHaveLength(50)

			const rows = await tx.select().from(items).where(eq(items.listId, list.id))
			expect(rows).toHaveLength(50)
		})
	})
})

describe('bulkCreateItemsImpl - rejection paths', () => {
	it('rejects when importEnabled is false', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id })
			await setImportEnabled(tx, false)

			const r = await bulkCreateItemsImpl({
				db: tx as any,
				actor: { id: user.id },
				input: { listId: list.id, items: [{ title: 'X' }] },
			})
			expect(r.kind).toBe('error')
			if (r.kind === 'error') expect(r.reason).toBe('feature-disabled')

			// Nothing was written.
			const rows = await tx.select().from(items).where(eq(items.listId, list.id))
			expect(rows).toHaveLength(0)
		})
	})

	it('rejects when the list does not exist', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			await setImportEnabled(tx, true)

			const r = await bulkCreateItemsImpl({
				db: tx as any,
				actor: { id: user.id },
				input: { listId: 999999, items: [{ title: 'X' }] },
			})
			expect(r.kind).toBe('error')
			if (r.kind === 'error') expect(r.reason).toBe('list-not-found')
		})
	})

	it('rejects with not-authorized when the actor cannot edit the list', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const stranger = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			await setImportEnabled(tx, true)

			const r = await bulkCreateItemsImpl({
				db: tx as any,
				actor: { id: stranger.id },
				input: { listId: list.id, items: [{ title: 'X' }] },
			})
			expect(r.kind).toBe('error')
			if (r.kind === 'error') expect(r.reason).toBe('not-authorized')

			// Permission failure rolls back: no items inserted.
			const rows = await tx.select().from(items).where(eq(items.listId, list.id))
			expect(rows).toHaveLength(0)
		})
	})
})

describe('bulkCreateItemsImpl - input validation', () => {
	it('schema requires at least title or url on each draft', async () => {
		const { BulkCreateItemsInputSchema } = await import('../_import-impl')
		const r = BulkCreateItemsInputSchema.safeParse({ listId: 1, items: [{}] })
		expect(r.success).toBe(false)
	})
})
