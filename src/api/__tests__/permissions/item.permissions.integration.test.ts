// Item-level permissions matrix.
//
// Surfaces covered:
//   - getItemsForListViewImpl  (visibility-gated; owner short-circuits to 'is-owner')
//   - createItemImpl           (edit-gated via assertCanEditItems)
//   - updateItemImpl           (edit-gated)
//   - archiveItemImpl          (edit-gated)
//   - deleteItemImpl           (edit-gated)
//
// The matrix encodes role x list-state x action; resource-specific gates
// that don't fit that shape live in the standalone describe blocks below.

import { makeGiftedItem, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { archiveItemImpl, getItemsForListViewImpl } from '@/api/_items-extra-impl'
import { createItemImpl, deleteItemImpl, updateItemImpl } from '@/api/_items-impl'
import { describeListState } from '@/lib/__tests__/permissions/_matrix-types'

import { itemExpectations } from './_expectations'
import { seedFor } from './_seeds'

const viewItemExpectations = itemExpectations.filter(e => e.action === 'view-item')
const createItemExpectations = itemExpectations.filter(e => e.action === 'create-item')
const updateItemExpectations = itemExpectations.filter(e => e.action === 'update-item')
const archiveItemExpectations = itemExpectations.filter(e => e.action === 'archive-item')
const deleteItemExpectations = itemExpectations.filter(e => e.action === 'delete-item')

describe('getItemsForListView x matrix', () => {
	it.each(viewItemExpectations)(
		'role=$role state=$listState.privacy/$listState.active -> $expected',
		async ({ role, listState, expected, reasonOnDeny }) => {
			await withRollback(async tx => {
				const { viewer, list } = await seedFor(role, { tx, listState })
				await makeItem(tx, { listId: list.id, title: 'matrix-item' })
				const result = await getItemsForListViewImpl({ userId: viewer.id, listId: String(list.id), dbx: tx })
				if (expected === 'allow') {
					expect(result.kind, `${role} on ${describeListState(listState)} should view-allow`).toBe('ok')
				} else {
					expect(result.kind, `${role} on ${describeListState(listState)} should view-deny`).toBe('error')
					if (result.kind === 'error' && reasonOnDeny) expect(result.reason).toBe(reasonOnDeny)
				}
			})
		}
	)
})

describe('createItem x matrix', () => {
	it.each(createItemExpectations)(
		'role=$role state=$listState.privacy/$listState.active -> $expected',
		async ({ role, listState, expected, reasonOnDeny }) => {
			await withRollback(async tx => {
				const { viewer, list } = await seedFor(role, { tx, listState })
				const result = await createItemImpl({
					db: tx,
					actor: { id: viewer.id },
					input: { listId: list.id, title: 'new-item' },
				})
				if (expected === 'allow') {
					expect(result.kind, `${role} on ${describeListState(listState)} should create-allow`).toBe('ok')
				} else {
					expect(result.kind, `${role} on ${describeListState(listState)} should create-deny`).toBe('error')
					if (result.kind === 'error' && reasonOnDeny) expect(result.reason).toBe(reasonOnDeny)
				}
			})
		}
	)
})

describe('updateItem x matrix', () => {
	it.each(updateItemExpectations)(
		'role=$role state=$listState.privacy/$listState.active -> $expected',
		async ({ role, listState, expected, reasonOnDeny }) => {
			await withRollback(async tx => {
				const { viewer, list } = await seedFor(role, { tx, listState })
				const item = await makeItem(tx, { listId: list.id })
				const result = await updateItemImpl({
					db: tx,
					actor: { id: viewer.id },
					input: { itemId: item.id, title: 'renamed' },
				})
				if (expected === 'allow') {
					expect(result.kind, `${role} on ${describeListState(listState)} should update-allow`).toBe('ok')
				} else {
					expect(result.kind, `${role} on ${describeListState(listState)} should update-deny`).toBe('error')
					if (result.kind === 'error' && reasonOnDeny) expect(result.reason).toBe(reasonOnDeny)
				}
			})
		}
	)
})

describe('archiveItem x matrix', () => {
	it.each(archiveItemExpectations)(
		'role=$role state=$listState.privacy/$listState.active -> $expected',
		async ({ role, listState, expected, reasonOnDeny }) => {
			await withRollback(async tx => {
				const { viewer, list } = await seedFor(role, { tx, listState })
				const item = await makeItem(tx, { listId: list.id })
				const result = await archiveItemImpl({ userId: viewer.id, input: { itemId: item.id, archived: true }, dbx: tx })
				if (expected === 'allow') {
					expect(result.kind, `${role} on ${describeListState(listState)} should archive-allow`).toBe('ok')
				} else {
					expect(result.kind, `${role} on ${describeListState(listState)} should archive-deny`).toBe('error')
					if (result.kind === 'error' && reasonOnDeny) expect(result.reason).toBe(reasonOnDeny)
				}
			})
		}
	)
})

describe('deleteItem x matrix', () => {
	it.each(deleteItemExpectations)(
		'role=$role state=$listState.privacy/$listState.active -> $expected',
		async ({ role, listState, expected, reasonOnDeny }) => {
			await withRollback(async tx => {
				const { viewer, list } = await seedFor(role, { tx, listState })
				const item = await makeItem(tx, { listId: list.id })
				const result = await deleteItemImpl({
					db: tx,
					actor: { id: viewer.id },
					input: { itemId: item.id },
				})
				if (expected === 'allow') {
					expect(result.kind, `${role} on ${describeListState(listState)} should delete-allow`).toBe('ok')
				} else {
					expect(result.kind, `${role} on ${describeListState(listState)} should delete-deny`).toBe('error')
					if (result.kind === 'error' && reasonOnDeny) expect(result.reason).toBe(reasonOnDeny)
				}
			})
		}
	)
})

// ---------------------------------------------------------------------------
// Non-matrix invariants
// ---------------------------------------------------------------------------

describe('getItemsForListView - restricted item-filter handoff', () => {
	// Locks in "list-level allow, item-level filter applies separately"
	// for the restricted role. The deeper filter cases (multi-claimer,
	// partner-claimer, co-gifter scrubbing) live in
	// restricted.permissions.integration.test.ts.
	it('returns ok for a restricted viewer even when items exist', async () => {
		await withRollback(async tx => {
			const { viewer, list } = await seedFor('restricted', { tx, listState: { privacy: 'public', active: true } })
			await makeItem(tx, { listId: list.id, title: 'unclaimed-visible' })
			const result = await getItemsForListViewImpl({ userId: viewer.id, listId: String(list.id), dbx: tx })
			expect(result.kind).toBe('ok')
		})
	})
})

describe('deleteItem on a claimed item flips pending-deletion', () => {
	// The recipient never sees claims (spoiler protection); deleting a
	// claimed item from the recipient side flips `items.pendingDeletionAt`
	// rather than hard-deleting, so gifters get the orphan-claim alert and
	// the existing claims survive until they acknowledge. See `.notes/logic.md`
	// "Pending-deletion" for the full lifecycle.
	it('returns ok and preserves the item + giftedItems rows', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: gifter.id })
			const result = await deleteItemImpl({ db: tx, actor: { id: owner.id }, input: { itemId: item.id } })
			expect(result.kind).toBe('ok')
		})
	})
})
