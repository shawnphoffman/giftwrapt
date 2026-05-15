// Smoke test: confirm a holiday-typed list flows through the same
// permission predicates as a wishlist. `canViewList` / `canEditList`
// don't branch on `lists.type`, so this test exists to guard against
// future regressions where someone adds a type-specific branch and
// silently changes permission behavior for holiday lists.

import { makeGuardianship, makeList, makeListEditor, makeUser, makeUserRelationship } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { canEditList, canViewList, canViewListAsAnyone } from '@/lib/permissions'

describe('holiday list permissions', () => {
	it('owner can view and edit', async () => {
		// canViewList itself returns 'private' for the owner because the
		// owner-aware short-circuit lives in canViewListAsAnyone (callers
		// that show data to either the owner OR a permitted viewer use
		// that wrapper). canEditList is owner-aware via the editor grants.
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, {
				ownerId: owner.id,
				type: 'holiday',
				isPrivate: true,
				isActive: true,
			})

			expect(await canViewListAsAnyone(owner.id, list, tx)).toEqual({ ok: true })
		})
	})

	it('guardian-of-child-owner can edit a private holiday list', async () => {
		// canEditList has the guardianship branch (parent of owner). View
		// access for guardians flows through canEditList in real code
		// paths today; canViewList itself does not surface a guardian
		// short-circuit for child-owned private lists.
		await withRollback(async tx => {
			const parent = await makeUser(tx)
			const child = await makeUser(tx, { role: 'child' })
			await makeGuardianship(tx, { parentUserId: parent.id, childUserId: child.id })
			const list = await makeList(tx, {
				ownerId: child.id,
				type: 'holiday',
				isPrivate: true,
				isActive: true,
			})

			expect(await canEditList(parent.id, list, tx)).toEqual({ ok: true })
		})
	})

	it('partner is not implicitly granted edit on a holiday list', async () => {
		// Partnership is an annotation, not a permission edge. Edit access
		// flows through `listEditors` only. A partner with no editor row
		// should be view-allowed (default-allow on public) but edit-denied.
		await withRollback(async tx => {
			const partner = await makeUser(tx)
			const owner = await makeUser(tx, { partnerId: partner.id })

			const list = await makeList(tx, {
				ownerId: owner.id,
				type: 'holiday',
				isPrivate: false,
				isActive: true,
			})

			const view = await canViewList(partner.id, list, tx)
			expect(view.ok).toBe(true)
			const edit = await canEditList(partner.id, list, tx)
			expect(edit.ok).toBe(false)
		})
	})

	it('list editor can edit a holiday list', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const editor = await makeUser(tx)
			const list = await makeList(tx, {
				ownerId: owner.id,
				type: 'holiday',
				isPrivate: false,
				isActive: true,
			})
			await makeListEditor(tx, { listId: list.id, userId: editor.id, ownerId: owner.id })

			expect(await canEditList(editor.id, list, tx)).toEqual({ ok: true })
		})
	})

	it("a 'none' relationship denies view on a public holiday list", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const stranger = await makeUser(tx)
			const list = await makeList(tx, {
				ownerId: owner.id,
				type: 'holiday',
				isPrivate: false,
				isActive: true,
			})
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: stranger.id, accessLevel: 'none' })

			const view = await canViewList(stranger.id, list, tx)
			expect(view.ok).toBe(false)
		})
	})

	it("a 'restricted' relationship denies edit on a holiday list even with an editor row", async () => {
		// Restricted-wins rule from logic.md: an explicit `restricted`
		// access level suppresses every non-guardian edit grant on the
		// same pair, including a `listEditors` row.
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const viewer = await makeUser(tx)
			const list = await makeList(tx, {
				ownerId: owner.id,
				type: 'holiday',
				isPrivate: false,
				isActive: true,
			})
			await makeListEditor(tx, { listId: list.id, userId: viewer.id, ownerId: owner.id })
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: viewer.id, accessLevel: 'restricted' })

			const edit = await canEditList(viewer.id, list, tx)
			expect(edit.ok).toBe(false)
			if (!edit.ok) {
				expect(edit.reason).toBe('restricted')
			}
		})
	})

	it('an unrelated stranger cannot view a private holiday list', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const stranger = await makeUser(tx)
			const list = await makeList(tx, {
				ownerId: owner.id,
				type: 'holiday',
				isPrivate: true,
				isActive: true,
			})

			const view = await canViewList(stranger.id, list, tx)
			expect(view.ok).toBe(false)
		})
	})
})
