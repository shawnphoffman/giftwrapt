// Covers the bundling behavior of the missing-price analyzer: items that
// have a URL but no price should produce one rec per (list × kind), each
// rec carrying its items as sub-rows rather than as separate cards.

import { describe, expect, it } from 'vitest'

import { DEFAULT_APP_SETTINGS } from '@/lib/settings'

import { makeItem, makeList, makeUser } from '../../../../test/integration/factories'
import { withRollback } from '../../../../test/integration/setup'
import { missingPriceAnalyzer } from '../analyzers/missing-price'
import type { AnalyzerContext } from '../context'

const noopLogger = { info: () => undefined, warn: () => undefined, error: () => undefined }

function buildCtx(tx: any, userId: string, opts: Partial<AnalyzerContext> = {}): AnalyzerContext {
	return {
		db: tx,
		userId,
		model: null,
		settings: DEFAULT_APP_SETTINGS,
		logger: noopLogger,
		now: new Date(),
		candidateCap: 100,
		dryRun: false,
		dependentId: null,
		subject: { kind: 'user', name: 'You', image: null },
		...opts,
	}
}

describe('missingPriceAnalyzer (bundled)', () => {
	it('emits no rec when no item is missing a price', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			await makeItem(tx, { listId: list.id, url: 'https://example.com/a', price: '12.34' })

			const result = await missingPriceAnalyzer.run(buildCtx(tx, user.id))
			expect(result.recs).toHaveLength(0)
		})
	})

	it('bundles multiple unpriced items on the same list into ONE rec with sub-items', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			await makeItem(tx, { listId: list.id, url: 'https://example.com/a', price: null, title: 'Alpha' })
			await makeItem(tx, { listId: list.id, url: 'https://example.com/b', price: null, title: 'Bravo' })
			await makeItem(tx, { listId: list.id, url: 'https://example.com/c', price: null, title: 'Charlie' })

			const result = await missingPriceAnalyzer.run(buildCtx(tx, user.id))
			expect(result.recs).toHaveLength(1)
			const rec = result.recs[0]
			expect(rec.kind).toBe('missing-price')
			expect(rec.subItems?.length).toBe(3)
			expect(rec.subItems?.map(s => s.title).sort()).toEqual(['Alpha', 'Bravo', 'Charlie'])
			// Bundle-level "Open list" link points at the list.
			expect(rec.bundleNav).toEqual({ listId: String(list.id) })
			// Each sub-row has its own Edit (nav) target.
			for (const sub of rec.subItems ?? []) {
				expect(sub.nav.listId).toBe(String(list.id))
				expect(sub.nav.openEdit).toBe(true)
			}
		})
	})

	it('emits one rec per list when items span multiple lists', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const a = await makeList(tx, { ownerId: user.id, type: 'wishlist', name: 'A' })
			const b = await makeList(tx, { ownerId: user.id, type: 'wishlist', name: 'B' })
			await makeItem(tx, { listId: a.id, url: 'https://example.com/a1', price: null })
			await makeItem(tx, { listId: a.id, url: 'https://example.com/a2', price: null })
			await makeItem(tx, { listId: b.id, url: 'https://example.com/b1', price: null })

			const result = await missingPriceAnalyzer.run(buildCtx(tx, user.id))
			expect(result.recs).toHaveLength(2)
			const byList = new Map(result.recs.map(r => [r.bundleNav?.listId, r]))
			expect(byList.get(String(a.id))?.subItems?.length).toBe(2)
			expect(byList.get(String(b.id))?.subItems?.length).toBe(1)
		})
	})

	it('fingerprint targets carry the listId, not the item ids', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const list = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			await makeItem(tx, { listId: list.id, url: 'https://example.com/a', price: null })
			await makeItem(tx, { listId: list.id, url: 'https://example.com/b', price: null })

			const result = await missingPriceAnalyzer.run(buildCtx(tx, user.id))
			expect(result.recs[0].fingerprintTargets).toEqual([`list:${list.id}`])
		})
	})

	it('skips items on giftideas and todos lists', async () => {
		await withRollback(async tx => {
			const user = await makeUser(tx)
			const gi = await makeList(tx, { ownerId: user.id, type: 'giftideas', isPrivate: true })
			const td = await makeList(tx, { ownerId: user.id, type: 'todos' })
			const wl = await makeList(tx, { ownerId: user.id, type: 'wishlist' })
			await makeItem(tx, { listId: gi.id, url: 'https://example.com/a', price: null })
			// todos lists don't actually use items table, but the analyzer
			// query filters by lists.type so the wishlist row is the only one
			// that should bubble up.
			void td
			await makeItem(tx, { listId: wl.id, url: 'https://example.com/c', price: null })

			const result = await missingPriceAnalyzer.run(buildCtx(tx, user.id))
			expect(result.recs).toHaveLength(1)
			expect(result.recs[0].bundleNav).toEqual({ listId: String(wl.id) })
		})
	})
})
