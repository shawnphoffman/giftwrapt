// Integration coverage for the `editable` bucket on `getMyLists`: the lists
// someone else owns that the caller can edit, through a list-level
// `listEditors` row or a user-level `userRelationships.canEdit` grant.

import { makeGuardianship, makeList, makeListEditor, makeUser, makeUserRelationship } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { getMyListsImpl } from '@/api/_lists-impl'

describe('getMyListsImpl - editable section', () => {
	it('lists the public lists of an owner who granted user-level edit', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx, { name: 'Owner' })
			const editor = await makeUser(tx, { name: 'Editor' })
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: editor.id, canEdit: true })
			await makeList(tx, { ownerId: owner.id, name: 'B list' })
			await makeList(tx, { ownerId: owner.id, name: 'A list', type: 'christmas' })

			const result = await getMyListsImpl(editor.id, tx)
			expect(result.editable.map(l => l.name)).toEqual(['A list', 'B list'])
			expect(result.editable.every(l => l.ownerName === 'Owner')).toBe(true)
		})
	})

	it('leaves out the private, gift-ideas, and inactive lists of a user-level grant', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const editor = await makeUser(tx)
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: editor.id, canEdit: true })
			await makeList(tx, { ownerId: owner.id, name: 'Public' })
			await makeList(tx, { ownerId: owner.id, name: 'Private', isPrivate: true })
			await makeList(tx, { ownerId: owner.id, name: 'Ideas', type: 'giftideas', isPrivate: true, giftIdeasTargetUserId: editor.id })
			await makeList(tx, { ownerId: owner.id, name: 'Old', isActive: false })

			const result = await getMyListsImpl(editor.id, tx)
			expect(result.editable.map(l => l.name)).toEqual(['Public'])
		})
	})

	it('ignores a grant without canEdit and a restricted pair', async () => {
		await withRollback(async tx => {
			const viewOnly = await makeUser(tx)
			const restricted = await makeUser(tx)
			const editor = await makeUser(tx)
			await makeUserRelationship(tx, { ownerUserId: viewOnly.id, viewerUserId: editor.id })
			await makeUserRelationship(tx, { ownerUserId: restricted.id, viewerUserId: editor.id, accessLevel: 'restricted', canEdit: true })
			await makeList(tx, { ownerId: viewOnly.id, name: 'View only' })
			await makeList(tx, { ownerId: restricted.id, name: 'Restricted' })

			const result = await getMyListsImpl(editor.id, tx)
			expect(result.editable).toEqual([])
		})
	})

	it('does not repeat a list that also has a list-level editor row, and keeps private lists granted that way', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const editor = await makeUser(tx)
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: editor.id, canEdit: true })
			const shared = await makeList(tx, { ownerId: owner.id, name: 'Shared' })
			const secret = await makeList(tx, { ownerId: owner.id, name: 'Secret', isPrivate: true })
			await makeListEditor(tx, { listId: shared.id, userId: editor.id, ownerId: owner.id })
			await makeListEditor(tx, { listId: secret.id, userId: editor.id, ownerId: owner.id })

			const result = await getMyListsImpl(editor.id, tx)
			expect(result.editable.map(l => l.name)).toEqual(['Secret', 'Shared'])
		})
	})

	it("keeps a child's lists in the children section only", async () => {
		await withRollback(async tx => {
			const parent = await makeUser(tx)
			const child = await makeUser(tx, { role: 'child' })
			await makeGuardianship(tx, { parentUserId: parent.id, childUserId: child.id })
			await makeUserRelationship(tx, { ownerUserId: child.id, viewerUserId: parent.id, canEdit: true })
			await makeList(tx, { ownerId: child.id, name: "Child's list" })

			const result = await getMyListsImpl(parent.id, tx)
			expect(result.editable).toEqual([])
			expect(result.children[0].lists.map(l => l.name)).toEqual(["Child's list"])
		})
	})
})
