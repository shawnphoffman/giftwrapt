// Restricted-tier integration tests.
//
// Covers the four contracts that the restricted access level introduces:
//   1. getViewerAccessLevel resolution (owner / guardian / partner short-
//      circuits + explicit row).
//   2. canEditList ignores canEdit=true and listEditors rows when the
//      relationship is restricted ("restricted wins" rule).
//   3. addListEditor rejects users whose relationship is restricted.
//   4. upsertUserRelationships blocks setting partners and guardian-paired
//      users to restricted, and removes any pre-existing listEditors rows
//      in the same transaction when restricting a non-blocked user.
//
// Item-level filter coverage lives in src/lib/__tests__/restricted-filter.test.ts
// (pure-function unit tests; no DB needed).

import {
	makeGiftedItem,
	makeGuardianship,
	makeItem,
	makeList,
	makeListAddon,
	makeListEditor,
	makeUser,
	makeUserRelationship,
} from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { getItemsForListViewImpl } from '@/api/_items-extra-impl'
import { createListAddonImpl } from '@/api/_list-addons-impl'
import { addListEditorImpl } from '@/api/_list-editors-impl'
import { getListForEditingImpl, getListForViewingImpl } from '@/api/_lists-impl'
import { upsertUserRelationshipsImpl } from '@/api/_permissions-impl'
import { listEditors, userRelationships, users } from '@/db/schema'
import { canEditList, getViewerAccessLevel } from '@/lib/permissions'

describe('getViewerAccessLevel', () => {
	it("returns 'owner' when viewer === owner", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const level = await getViewerAccessLevel(owner.id, owner.id, tx)
			expect(level).toBe('owner')
		})
	})

	it("short-circuits to 'view' for guardian → child even with a stale 'none' row", async () => {
		await withRollback(async tx => {
			const child = await makeUser(tx, { role: 'child' })
			const parent = await makeUser(tx)
			await makeGuardianship(tx, { parentUserId: parent.id, childUserId: child.id })
			await makeUserRelationship(tx, { ownerUserId: child.id, viewerUserId: parent.id, accessLevel: 'none' })
			const level = await getViewerAccessLevel(parent.id, child.id, tx)
			expect(level).toBe('view')
		})
	})

	it("short-circuits to 'view' for partners even with a stale 'restricted' row", async () => {
		await withRollback(async tx => {
			const a = await makeUser(tx)
			const b = await makeUser(tx, { partnerId: a.id })
			await tx.update(users).set({ partnerId: b.id }).where(eq(users.id, a.id))
			await makeUserRelationship(tx, { ownerUserId: a.id, viewerUserId: b.id, accessLevel: 'restricted' })
			const level = await getViewerAccessLevel(b.id, a.id, tx)
			expect(level).toBe('view')
		})
	})

	it('returns the row accessLevel when no short-circuit applies', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const viewer = await makeUser(tx)
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: viewer.id, accessLevel: 'restricted' })
			const level = await getViewerAccessLevel(viewer.id, owner.id, tx)
			expect(level).toBe('restricted')
		})
	})

	it("defaults to 'view' when no row exists", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const viewer = await makeUser(tx)
			const level = await getViewerAccessLevel(viewer.id, owner.id, tx)
			expect(level).toBe('view')
		})
	})
})

describe('canEditList × restricted (restricted-wins)', () => {
	it('denies even when canEdit=true is also set on the row', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const viewer = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			// Stale combination: schema allows it, app must reject.
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: viewer.id, accessLevel: 'restricted', canEdit: true })
			const result = await canEditList(viewer.id, list, tx)
			expect(result.ok).toBe(false)
			if (!result.ok) expect(result.reason).toBe('restricted')
		})
	})

	it('denies even when a listEditors row also exists', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const viewer = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			await makeListEditor(tx, { listId: list.id, userId: viewer.id, ownerId: owner.id })
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: viewer.id, accessLevel: 'restricted' })
			const result = await canEditList(viewer.id, list, tx)
			expect(result.ok).toBe(false)
		})
	})

	it('still allows guardian access (guardianship beats the relationship row)', async () => {
		await withRollback(async tx => {
			const child = await makeUser(tx, { role: 'child' })
			const parent = await makeUser(tx)
			await makeGuardianship(tx, { parentUserId: parent.id, childUserId: child.id })
			const list = await makeList(tx, { ownerId: child.id })
			// Even if a 'restricted' row sneaks in (it shouldn't, but),
			// guardianship is checked first and short-circuits to allow.
			await makeUserRelationship(tx, { ownerUserId: child.id, viewerUserId: parent.id, accessLevel: 'restricted' })
			const result = await canEditList(parent.id, list, tx)
			expect(result.ok).toBe(true)
		})
	})
})

describe('getListForEditing rejects restricted viewers', () => {
	it('returns not-authorized for a restricted viewer who would otherwise have a listEditors row', async () => {
		// The restricted-wins rule means even a stale list-editor grant must
		// not let the viewer reach the edit page. The route translates this
		// error to a 404, so an old `/edit` link silently 404s.
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const viewer = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			await makeListEditor(tx, { listId: list.id, userId: viewer.id, ownerId: owner.id })
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: viewer.id, accessLevel: 'restricted' })

			const result = await getListForEditingImpl({ userId: viewer.id, listId: String(list.id), dbx: tx })
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('not-authorized')
		})
	})

	it('returns not-authorized for a restricted viewer with a stale canEdit=true row', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const viewer = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: viewer.id, accessLevel: 'restricted', canEdit: true })

			const result = await getListForEditingImpl({ userId: viewer.id, listId: String(list.id), dbx: tx })
			expect(result.kind).toBe('error')
		})
	})

	it('still lets the owner access their own edit page', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const result = await getListForEditingImpl({ userId: owner.id, listId: String(list.id), dbx: tx })
			expect(result.kind).toBe('ok')
		})
	})
})

describe('getItemsForListView e2e for restricted viewers', () => {
	it('hides items claimed only by outsiders and surfaces items the viewer claimed', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const viewer = await makeUser(tx)
			const stranger = await makeUser(tx)
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: viewer.id, accessLevel: 'restricted' })
			const list = await makeList(tx, { ownerId: owner.id })

			await makeItem(tx, { listId: list.id, title: 'unclaimed' })
			const visibleSelfClaim = await makeItem(tx, { listId: list.id, title: 'self-claim' })
			await makeGiftedItem(tx, { itemId: visibleSelfClaim.id, gifterId: viewer.id })
			const hiddenStrangerClaim = await makeItem(tx, { listId: list.id, title: 'stranger' })
			await makeGiftedItem(tx, { itemId: hiddenStrangerClaim.id, gifterId: stranger.id })

			const result = await getItemsForListViewImpl({ userId: viewer.id, listId: String(list.id), dbx: tx })
			if (result.kind !== 'ok') throw new Error('expected ok')
			const titles = result.items.map(i => i.title).sort()
			expect(titles).toEqual(['self-claim', 'unclaimed'])
			// The stranger's claim must not leak via the visible item's gifts array.
			const selfItem = result.items.find(i => i.title === 'self-claim')!
			expect(selfItem.gifts.every(g => g.gifterId === viewer.id)).toBe(true)
		})
	})

	it('non-restricted viewers see all items with all claims (control)', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const viewer = await makeUser(tx)
			const stranger = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const item = await makeItem(tx, { listId: list.id, title: 'visible' })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: stranger.id })

			const result = await getItemsForListViewImpl({ userId: viewer.id, listId: String(list.id), dbx: tx })
			if (result.kind !== 'ok') throw new Error('expected ok')
			expect(result.items).toHaveLength(1)
			expect(result.items[0].gifts).toHaveLength(1)
		})
	})
})

describe('getListForViewing addons e2e for restricted viewers', () => {
	it("returns only the restricted viewer's own addons, not the strangers'", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const viewer = await makeUser(tx)
			const stranger = await makeUser(tx)
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: viewer.id, accessLevel: 'restricted' })
			const list = await makeList(tx, { ownerId: owner.id })

			await makeListAddon(tx, { listId: list.id, userId: viewer.id, description: 'mine' })
			await makeListAddon(tx, { listId: list.id, userId: stranger.id, description: 'theirs' })

			const result = await getListForViewingImpl({ userId: viewer.id, listId: String(list.id), dbx: tx })
			if (!result || result.kind !== 'ok') throw new Error('expected ok')
			const descriptions = result.list.addons.map(a => a.description).sort()
			expect(descriptions).toEqual(['mine'])
		})
	})

	it("non-restricted viewers see every gifter's addons (control)", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const viewer = await makeUser(tx)
			const stranger = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			await makeListAddon(tx, { listId: list.id, userId: viewer.id, description: 'mine' })
			await makeListAddon(tx, { listId: list.id, userId: stranger.id, description: 'theirs' })

			const result = await getListForViewingImpl({ userId: viewer.id, listId: String(list.id), dbx: tx })
			if (!result || result.kind !== 'ok') throw new Error('expected ok')
			expect(result.list.addons.map(a => a.description).sort()).toEqual(['mine', 'theirs'])
		})
	})

	it('a restricted viewer can still create an addon', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const viewer = await makeUser(tx)
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: viewer.id, accessLevel: 'restricted' })
			const list = await makeList(tx, { ownerId: owner.id })

			const res = await createListAddonImpl({
				userId: viewer.id,
				input: { listId: list.id, description: 'extra socks', totalCost: undefined },
				dbx: tx,
			})
			expect(res.kind).toBe('ok')
		})
	})
})

describe('addListEditor blocks restricted users', () => {
	it('returns user-is-restricted when the relationship is restricted', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const viewer = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: viewer.id, accessLevel: 'restricted' })

			// addListEditorImpl uses the production `db` singleton, which the
			// vitest setup mocks to the same per-worker pglite instance, so
			// data seeded inside `tx` is visible after the savepoint commits
			// at the end of this block. The test still rolls back at the end.
			const res = await addListEditorImpl({ ownerId: owner.id, input: { listId: list.id, userId: viewer.id }, dbx: tx })
			expect(res.kind).toBe('error')
			if (res.kind === 'error') expect(res.reason).toBe('user-is-restricted')
		})
	})
})

describe('upsertUserRelationships invariants', () => {
	it("rejects setting a partner to 'restricted'", async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx)
			const partner = await makeUser(tx, { partnerId: me.id })
			await tx.update(users).set({ partnerId: partner.id }).where(eq(users.id, me.id))

			const res = await upsertUserRelationshipsImpl({
				ownerUserId: me.id,
				input: { relationships: [{ viewerUserId: partner.id, accessLevel: 'restricted', canEdit: false }] },
				dbx: tx,
			})
			expect(res.success).toBe(false)
			if (!res.success) expect(res.reason).toBe('restricted-not-allowed')
		})
	})

	it("rejects setting a guardian-paired user to 'restricted'", async () => {
		await withRollback(async tx => {
			const child = await makeUser(tx, { role: 'child' })
			const parent = await makeUser(tx)
			await makeGuardianship(tx, { parentUserId: parent.id, childUserId: child.id })

			const res = await upsertUserRelationshipsImpl({
				ownerUserId: child.id,
				input: { relationships: [{ viewerUserId: parent.id, accessLevel: 'restricted', canEdit: false }] },
				dbx: tx,
			})
			expect(res.success).toBe(false)
		})
	})

	it("removes existing listEditors rows when the relationship becomes 'restricted'", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const viewer = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			await makeListEditor(tx, { listId: list.id, userId: viewer.id, ownerId: owner.id })

			const res = await upsertUserRelationshipsImpl({
				ownerUserId: owner.id,
				input: { relationships: [{ viewerUserId: viewer.id, accessLevel: 'restricted', canEdit: false }] },
				dbx: tx,
			})
			expect(res.success).toBe(true)

			const remaining = await tx
				.select({ id: listEditors.id })
				.from(listEditors)
				.where(and(eq(listEditors.ownerId, owner.id), eq(listEditors.userId, viewer.id)))
			expect(remaining).toHaveLength(0)
		})
	})

	it("forces canEdit=false when storing accessLevel='restricted'", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const viewer = await makeUser(tx)
			const res = await upsertUserRelationshipsImpl({
				ownerUserId: owner.id,
				input: { relationships: [{ viewerUserId: viewer.id, accessLevel: 'restricted', canEdit: true }] },
				dbx: tx,
			})
			expect(res.success).toBe(true)
			const row = await tx.query.userRelationships.findFirst({
				where: and(eq(userRelationships.ownerUserId, owner.id), eq(userRelationships.viewerUserId, viewer.id)),
			})
			expect(row?.accessLevel).toBe('restricted')
			expect(row?.canEdit).toBe(false)
		})
	})
})
