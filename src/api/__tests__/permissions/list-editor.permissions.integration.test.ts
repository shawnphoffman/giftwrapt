// List-editor management permissions matrix.
//
// Surfaces covered:
//   - addListEditorImpl        (owner-only; rejects child, self, restricted, duplicate)
//   - removeListEditorImpl     (owner-only)
//   - getListEditorsImpl       (owner-only)
//   - getAddableEditorsImpl    (owner-only; excludes child, denied, restricted, existing editor)

import { makeList, makeListEditor, makeUser, makeUserRelationship } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { addListEditorImpl, getAddableEditorsImpl, getListEditorsImpl, removeListEditorImpl } from '@/api/_list-editors-impl'
import { describeListState } from '@/lib/__tests__/permissions/_matrix-types'

import { listEditorExpectations } from './_expectations'
import { seedFor } from './_seeds'

describe('addListEditor x matrix', () => {
	// In every matrix row the OWNER is the actor and `role` describes the
	// proposed target's relationship to the owner. List state isn't read
	// by the impl, but we still iterate every state to lock that in.
	it.each(listEditorExpectations)(
		'target role=$role state=$listState.privacy/$listState.active -> $expected',
		async ({ role, listState, expected, reasonOnDeny }) => {
			await withRollback(async tx => {
				const { viewer, owner, list } = await seedFor(role, { tx, listState })
				const result = await addListEditorImpl({
					ownerId: owner.id,
					input: { listId: list.id, userId: viewer.id },
					dbx: tx,
				})
				if (expected === 'allow') {
					expect(result.kind, `target ${role} on ${describeListState(listState)} should add-allow`).toBe('ok')
				} else {
					expect(result.kind, `target ${role} on ${describeListState(listState)} should add-deny`).toBe('error')
					if (result.kind === 'error' && reasonOnDeny) expect(result.reason).toBe(reasonOnDeny)
				}
			})
		}
	)
})

// ---------------------------------------------------------------------------
// Non-matrix invariants
// ---------------------------------------------------------------------------

describe('addListEditor - owner gate', () => {
	it("rejects a non-owner caller with 'not-owner'", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const stranger = await makeUser(tx)
			const target = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const result = await addListEditorImpl({
				ownerId: stranger.id,
				input: { listId: list.id, userId: target.id },
				dbx: tx,
			})
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('not-owner')
		})
	})

	it("rejects a missing list with 'list-not-found'", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const target = await makeUser(tx)
			const result = await addListEditorImpl({
				ownerId: owner.id,
				input: { listId: 999_999, userId: target.id },
				dbx: tx,
			})
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('list-not-found')
		})
	})

	it("rejects a missing user with 'user-not-found'", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const result = await addListEditorImpl({
				ownerId: owner.id,
				input: { listId: list.id, userId: 'nonexistent' },
				dbx: tx,
			})
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('user-not-found')
		})
	})
})

describe('removeListEditor - owner gate', () => {
	it('lets the owner remove an editor', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const editor = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const row = await makeListEditor(tx, { listId: list.id, userId: editor.id, ownerId: owner.id })
			const result = await removeListEditorImpl({ ownerId: owner.id, input: { editorId: row.id }, dbx: tx })
			expect(result.kind).toBe('ok')
		})
	})

	it("rejects a non-owner with 'not-owner'", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const editor = await makeUser(tx)
			const stranger = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const row = await makeListEditor(tx, { listId: list.id, userId: editor.id, ownerId: owner.id })
			const result = await removeListEditorImpl({ ownerId: stranger.id, input: { editorId: row.id }, dbx: tx })
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('not-owner')
		})
	})
})

describe('getListEditors - owner-only', () => {
	it('returns rows for the owner', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const editor = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			await makeListEditor(tx, { listId: list.id, userId: editor.id, ownerId: owner.id })
			const rows = await getListEditorsImpl({ userId: owner.id, listId: list.id, dbx: tx })
			expect(rows.length).toBe(1)
		})
	})

	it('returns [] for a non-owner (the route layer translates this to 403)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const stranger = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const rows = await getListEditorsImpl({ userId: stranger.id, listId: list.id, dbx: tx })
			expect(rows).toEqual([])
		})
	})
})

describe('getAddableEditors - excludes children, denied, restricted, existing', () => {
	it('hides users the owner has marked restricted or denied', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const candidate = await makeUser(tx)
			const restricted = await makeUser(tx)
			const denied = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: restricted.id, accessLevel: 'restricted' })
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: denied.id, accessLevel: 'none' })

			const rows = await getAddableEditorsImpl({ ownerId: owner.id, listId: list.id, dbx: tx })
			const ids = rows.map(r => r.id)
			expect(ids).toContain(candidate.id)
			expect(ids).not.toContain(restricted.id)
			expect(ids).not.toContain(denied.id)
		})
	})

	it('hides users already on the list-editor list', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const editor = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			await makeListEditor(tx, { listId: list.id, userId: editor.id, ownerId: owner.id })

			const rows = await getAddableEditorsImpl({ ownerId: owner.id, listId: list.id, dbx: tx })
			expect(rows.map(r => r.id)).not.toContain(editor.id)
		})
	})
})
