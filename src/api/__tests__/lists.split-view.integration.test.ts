// Smoke-coverage for the empty-loader split of getListForViewingImpl into
// three impls: getListAccessImpl (loader-only gate), getListHeaderImpl,
// getListAddonsImpl. The full happy-path + edge cases for the composite
// remain covered by lists.archived-list-orphan-nav and
// permissions/restricted.permissions.integration.test.ts. This file adds
// the per-function smoke for the new split surfaces.

import { makeList, makeListAddon, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { getListAccessImpl, getListAddonsImpl, getListHeaderImpl } from '@/api/_lists-impl'

describe('getListAccessImpl', () => {
	it('returns ok for a public list a stranger can view', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const viewer = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, isPrivate: false })

			const result = await getListAccessImpl({ userId: viewer.id, listId: String(list.id), dbx: tx })
			expect(result).toEqual({ kind: 'ok', listId: list.id })
		})
	})

	it('redirects an owner viewing their own non-dependent list', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })

			const result = await getListAccessImpl({ userId: owner.id, listId: String(list.id), dbx: tx })
			expect(result).toEqual({ kind: 'redirect', listId: String(list.id) })
		})
	})

	it('returns null when the list does not exist', async () => {
		await withRollback(async tx => {
			const viewer = await makeUser(tx)
			const result = await getListAccessImpl({ userId: viewer.id, listId: '999999', dbx: tx })
			expect(result).toBeNull()
		})
	})

	it('returns null for a private list the viewer is not added to', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const stranger = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, isPrivate: true })

			const result = await getListAccessImpl({ userId: stranger.id, listId: String(list.id), dbx: tx })
			expect(result).toBeNull()
		})
	})
})

describe('getListHeaderImpl', () => {
	it('returns header data + groups but no addons field', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const viewer = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, isPrivate: false })

			const result = await getListHeaderImpl({ userId: viewer.id, listId: String(list.id), dbx: tx })
			expect(result?.kind).toBe('ok')
			expect(result?.list.id).toBe(list.id)
			expect(result?.list.owner.id).toBe(owner.id)
			expect(result?.list.groups).toEqual([])
			// Header response should not include addons; addons are a
			// separate query in the empty-loader pattern.
			expect(result?.list as unknown as { addons?: unknown }).not.toHaveProperty('addons')
		})
	})

	it('returns null for a list the viewer cannot see', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const stranger = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, isPrivate: true })

			const result = await getListHeaderImpl({ userId: stranger.id, listId: String(list.id), dbx: tx })
			expect(result).toBeNull()
		})
	})
})

describe('getListAddonsImpl', () => {
	it('returns addons for a public list a stranger can view', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const viewer = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, isPrivate: false })
			await makeListAddon(tx, { listId: list.id, userId: viewer.id })

			const result = await getListAddonsImpl({ userId: viewer.id, listId: String(list.id), dbx: tx })
			expect(result?.kind).toBe('ok')
			expect(result?.addons.length).toBe(1)
		})
	})

	it('strips totalCost from addons the viewer does not own', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifterA = await makeUser(tx)
			const gifterB = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id, isPrivate: false })
			await makeListAddon(tx, { listId: list.id, userId: gifterB.id, totalCost: '12.34' })

			const result = await getListAddonsImpl({ userId: gifterA.id, listId: String(list.id), dbx: tx })
			expect(result?.kind).toBe('ok')
			expect(result?.addons[0]?.totalCost).toBeNull()
		})
	})

	it('returns null when the list does not exist', async () => {
		await withRollback(async tx => {
			const viewer = await makeUser(tx)
			const result = await getListAddonsImpl({ userId: viewer.id, listId: '999999', dbx: tx })
			expect(result).toBeNull()
		})
	})
})
