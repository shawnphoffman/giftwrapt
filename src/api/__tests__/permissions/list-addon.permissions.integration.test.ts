// List-addon (off-list gift) permissions matrix.
//
// Surfaces covered:
//   - createListAddonImpl      (canViewList-gated; owner blocked with 'cannot-add-to-own-list')
//   - updateListAddonImpl      (author-only)
//   - archiveListAddonImpl     (author-only)
//   - deleteListAddonImpl      (author-only, hard delete)
//
// Per logic.md, addons are recipient-driven for fulfilment; there is no
// gifter-facing "mark as given" surface today. The archive path still
// exists as a server fn but is no longer wired into the UI.

import { makeList, makeListAddon, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { archiveListAddonImpl, createListAddonImpl, deleteListAddonImpl, updateListAddonImpl } from '@/api/_list-addons-impl'
import { describeListState } from '@/lib/__tests__/permissions/_matrix-types'

import { listAddonExpectations } from './_expectations'
import { seedFor } from './_seeds'

const createAddonMatrix = listAddonExpectations.filter(e => e.action === 'create-addon')

describe('createListAddon x matrix', () => {
	it.each(createAddonMatrix)(
		'role=$role state=$listState.privacy/$listState.active -> $expected',
		async ({ role, listState, expected, reasonOnDeny }) => {
			await withRollback(async tx => {
				const { viewer, list } = await seedFor(role, { tx, listState })
				const result = await createListAddonImpl({
					userId: viewer.id,
					input: { listId: list.id, description: 'extra socks', totalCost: undefined },
					dbx: tx,
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

// ---------------------------------------------------------------------------
// Non-matrix invariants
// ---------------------------------------------------------------------------

describe('updateListAddon - author-only', () => {
	it('lets the author update their own addon', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const author = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const addon = await makeListAddon(tx, { listId: list.id, userId: author.id })
			const result = await updateListAddonImpl({
				userId: author.id,
				input: { addonId: addon.id, description: 'edited', totalCost: undefined },
				dbx: tx,
			})
			expect(result.kind).toBe('ok')
		})
	})

	it("rejects a stranger with 'not-yours'", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const author = await makeUser(tx)
			const stranger = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const addon = await makeListAddon(tx, { listId: list.id, userId: author.id })
			const result = await updateListAddonImpl({
				userId: stranger.id,
				input: { addonId: addon.id, description: 'edited', totalCost: undefined },
				dbx: tx,
			})
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('not-yours')
		})
	})

	it("rejects the list owner with 'not-yours' (addons aren't an owner-managed surface)", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const author = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const addon = await makeListAddon(tx, { listId: list.id, userId: author.id })
			const result = await updateListAddonImpl({
				userId: owner.id,
				input: { addonId: addon.id, description: 'edited', totalCost: undefined },
				dbx: tx,
			})
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('not-yours')
		})
	})
})

describe('archiveListAddon - author-only', () => {
	it('lets the author archive their addon', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const author = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const addon = await makeListAddon(tx, { listId: list.id, userId: author.id })
			const result = await archiveListAddonImpl({ userId: author.id, input: { addonId: addon.id }, dbx: tx })
			expect(result.kind).toBe('ok')
		})
	})

	it("rejects a stranger with 'not-yours'", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const author = await makeUser(tx)
			const stranger = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const addon = await makeListAddon(tx, { listId: list.id, userId: author.id })
			const result = await archiveListAddonImpl({ userId: stranger.id, input: { addonId: addon.id }, dbx: tx })
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('not-yours')
		})
	})
})

describe('deleteListAddon - author-only', () => {
	it('lets the author delete their addon (hard delete)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const author = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const addon = await makeListAddon(tx, { listId: list.id, userId: author.id })
			const result = await deleteListAddonImpl({ userId: author.id, input: { addonId: addon.id }, dbx: tx })
			expect(result.kind).toBe('ok')
		})
	})

	it("rejects a stranger with 'not-yours'", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const author = await makeUser(tx)
			const stranger = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const addon = await makeListAddon(tx, { listId: list.id, userId: author.id })
			const result = await deleteListAddonImpl({ userId: stranger.id, input: { addonId: addon.id }, dbx: tx })
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('not-yours')
		})
	})
})
