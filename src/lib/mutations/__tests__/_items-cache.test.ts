import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import {
	filterOutItemIds,
	filterOutItemsInGroups,
	type ItemRowLike,
	patchItemById,
	patchItemsByIds,
	rollbackItemCache,
	snapshotItemCache,
	transformItemCache,
} from '@/lib/mutations/_items-cache'
import { itemsKeys } from '@/lib/queries/items'

// The real ItemForEditing/ItemWithGifts shapes are wide. ItemRowLike is the
// narrow contract these helpers actually rely on (`id`, optional `groupId`,
// patchable fields). Build minimal rows and cast at the boundary.
type Row = { id: number; groupId: number | null; title: string; priority?: string }
const row = (over: Partial<Row> & { id: number }): Row => ({
	groupId: null,
	title: `Item ${over.id}`,
	...over,
})
const rows = (...xs: Array<Partial<Row> & { id: number }>) => xs.map(row) as unknown as ReadonlyArray<ItemRowLike>

function makeClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
		},
	})
}

function seedListCache(qc: QueryClient, listId: number, viewRows: ReadonlyArray<ItemRowLike>, editRows: ReadonlyArray<ItemRowLike>): void {
	qc.setQueryData(itemsKeys.view(listId), viewRows)
	qc.setQueryData(itemsKeys.edit(listId, false), editRows)
}

describe('snapshotItemCache', () => {
	it('captures every cache entry whose key starts with byList(listId)', async () => {
		const qc = makeClient()
		seedListCache(qc, 1, rows({ id: 10 }), rows({ id: 10 }, { id: 11 }))
		// Cache for an unrelated list should NOT be captured.
		qc.setQueryData(itemsKeys.view(2), rows({ id: 99 }))

		const snap = await snapshotItemCache(qc, 1)

		expect(snap).toHaveLength(2)
		const keys = snap.map(([k]) => k)
		expect(keys).toContainEqual(itemsKeys.view(1))
		expect(keys).toContainEqual(itemsKeys.edit(1, false))
		// Unrelated list excluded.
		expect(keys).not.toContainEqual(itemsKeys.view(2))
	})

	it('does not mutate cache contents', async () => {
		const qc = makeClient()
		const before = rows({ id: 1, title: 'before' })
		qc.setQueryData(itemsKeys.view(7), before)

		await snapshotItemCache(qc, 7)

		expect(qc.getQueryData(itemsKeys.view(7))).toBe(before)
	})

	it('returns an empty snapshot when the list has no cached entries', async () => {
		const qc = makeClient()
		const snap = await snapshotItemCache(qc, 999)
		expect(snap).toEqual([])
	})
})

describe('rollbackItemCache', () => {
	it('restores every key from a snapshot exactly', async () => {
		const qc = makeClient()
		const originalView = rows({ id: 1, title: 'A' })
		const originalEdit = rows({ id: 1, title: 'A' }, { id: 2, title: 'B' })
		seedListCache(qc, 1, originalView, originalEdit)
		const snap = await snapshotItemCache(qc, 1)

		// Stomp the cache.
		qc.setQueryData(itemsKeys.view(1), rows({ id: 99 }))
		qc.setQueryData(itemsKeys.edit(1, false), rows({ id: 99 }))

		rollbackItemCache(qc, snap)

		expect(qc.getQueryData(itemsKeys.view(1))).toEqual(originalView)
		expect(qc.getQueryData(itemsKeys.edit(1, false))).toEqual(originalEdit)
	})

	it('is a no-op when given undefined', () => {
		const qc = makeClient()
		const before = rows({ id: 1 })
		qc.setQueryData(itemsKeys.view(1), before)

		rollbackItemCache(qc, undefined)

		expect(qc.getQueryData(itemsKeys.view(1))).toBe(before)
	})

	it('skips unrelated keys it never recorded', async () => {
		const qc = makeClient()
		seedListCache(qc, 1, rows({ id: 1 }), rows({ id: 1 }))
		const snap = await snapshotItemCache(qc, 1)

		const elsewhere = rows({ id: 50 })
		qc.setQueryData(itemsKeys.view(2), elsewhere)
		rollbackItemCache(qc, snap)

		// List 2 was never in the snapshot, so rollback shouldn't touch it.
		expect(qc.getQueryData(itemsKeys.view(2))).toBe(elsewhere)
	})
})

describe('transformItemCache', () => {
	it('applies the transform to every matching cache entry', () => {
		const qc = makeClient()
		seedListCache(qc, 1, rows({ id: 1 }, { id: 2 }), rows({ id: 1 }, { id: 2 }, { id: 3 }))

		transformItemCache(qc, 1, items => items.filter(item => item.id !== 2) as typeof items)

		expect(qc.getQueryData<ReadonlyArray<ItemRowLike>>(itemsKeys.view(1))?.map(item => item.id)).toEqual([1])
		expect(qc.getQueryData<ReadonlyArray<ItemRowLike>>(itemsKeys.edit(1, false))?.map(item => item.id)).toEqual([1, 3])
	})

	it('does not touch cache entries for other lists', () => {
		const qc = makeClient()
		seedListCache(qc, 1, rows({ id: 1 }), rows({ id: 1 }))
		const otherList = rows({ id: 1, title: 'untouched' })
		qc.setQueryData(itemsKeys.view(2), otherList)

		transformItemCache(qc, 1, () => [])

		expect(qc.getQueryData(itemsKeys.view(2))).toBe(otherList)
	})

	it('skips queries whose data is undefined', () => {
		const qc = makeClient()
		// Seed a cache entry with undefined data. `setQueryData(_, undefined)`
		// does NOT register the entry, so we can't seed undefined directly.
		// Instead, leave the cache empty and assert the transform is a no-op.
		transformItemCache(qc, 1, () => {
			throw new Error('transform should not run when there is no cached data')
		})
		expect(qc.getQueryData(itemsKeys.view(1))).toBeUndefined()
	})
})

describe('patchItemById', () => {
	it('patches the matching id, leaves others untouched', () => {
		const xs = rows({ id: 1, title: 'a' }, { id: 2, title: 'b' }, { id: 3, title: 'c' })
		const out = patchItemById(2, { title: 'B!' as never })(xs)
		expect(out.map(r => (r as Row).title)).toEqual(['a', 'B!', 'c'])
	})

	it('is a no-op when no row matches', () => {
		const xs = rows({ id: 1 }, { id: 2 })
		const out = patchItemById(99, { title: 'x' as never })(xs)
		expect(out).toEqual(xs)
	})
})

describe('patchItemsByIds', () => {
	it('patches every row whose id is in the set', () => {
		const xs = rows({ id: 1, title: 'a' }, { id: 2, title: 'b' }, { id: 3, title: 'c' })
		const out = patchItemsByIds([1, 3], { title: 'X' as never })(xs)
		expect(out.map(r => (r as Row).title)).toEqual(['X', 'b', 'X'])
	})

	it('preserves order of survivors and non-matches', () => {
		const xs = rows({ id: 1 }, { id: 2 }, { id: 3 })
		const out = patchItemsByIds([2], { priority: 'high' as never })(xs)
		expect(out.map(r => r.id)).toEqual([1, 2, 3])
	})

	it('is a no-op when the id list is empty', () => {
		const xs = rows({ id: 1 }, { id: 2 })
		const out = patchItemsByIds([], { title: 'x' as never })(xs)
		expect(out).toEqual(xs)
	})
})

describe('filterOutItemIds', () => {
	it('removes every row whose id is in the set', () => {
		const xs = rows({ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 })
		const out = filterOutItemIds([2, 4])(xs)
		expect(out.map(r => r.id)).toEqual([1, 3])
	})

	it('preserves order of survivors', () => {
		const xs = rows({ id: 5 }, { id: 1 }, { id: 4 }, { id: 2 })
		const out = filterOutItemIds([1])(xs)
		expect(out.map(r => r.id)).toEqual([5, 4, 2])
	})

	it('is a no-op when the id list is empty', () => {
		const xs = rows({ id: 1 }, { id: 2 })
		const out = filterOutItemIds([])(xs)
		expect(out).toEqual(xs)
	})
})

describe('filterOutItemsInGroups', () => {
	it('removes only rows whose groupId is in the set', () => {
		const xs = rows({ id: 1, groupId: 10 }, { id: 2, groupId: 11 }, { id: 3, groupId: 10 }, { id: 4, groupId: null })
		const out = filterOutItemsInGroups([10])(xs)
		expect(out.map(r => r.id)).toEqual([2, 4])
	})

	it('always keeps rows with a null groupId, even when sets are empty', () => {
		const xs = rows({ id: 1, groupId: null }, { id: 2, groupId: 5 })
		const out = filterOutItemsInGroups([])(xs)
		// Empty set never matches, so nothing is removed.
		expect(out.map(r => r.id)).toEqual([1, 2])
	})

	it('removes nothing when no row matches', () => {
		const xs = rows({ id: 1, groupId: 1 }, { id: 2, groupId: 2 })
		const out = filterOutItemsInGroups([99])(xs)
		expect(out).toEqual(xs)
	})
})

describe('snapshot + rollback round-trip', () => {
	it('a transform followed by rollback restores the original state', async () => {
		const qc = makeClient()
		const view = rows({ id: 1 }, { id: 2 }, { id: 3 })
		const edit = rows({ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 })
		seedListCache(qc, 1, view, edit)

		const snap = await snapshotItemCache(qc, 1)
		transformItemCache(qc, 1, filterOutItemIds([2, 3]))

		// Confirm transform actually ran.
		expect(qc.getQueryData<ReadonlyArray<ItemRowLike>>(itemsKeys.view(1))?.map(r => r.id)).toEqual([1])

		rollbackItemCache(qc, snap)

		expect(qc.getQueryData(itemsKeys.view(1))).toEqual(view)
		expect(qc.getQueryData(itemsKeys.edit(1, false))).toEqual(edit)
	})
})
