// Integration coverage for the `dependents: Array<DependentListGroup>`
// shape on `getMyLists`. The unit tests cover canViewList/canEditList
// and the impl-level CRUD, but the actual list assembly that /me, the
// public feed, and the create-list picker all consume happens here.

import { makeDependent, makeDependentGuardianship, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { getMyListsImpl } from '@/api/_lists-impl'

describe('getMyListsImpl - dependents section', () => {
	it('returns a per-dependent group for each guardianship the caller has', async () => {
		await withRollback(async tx => {
			const alice = await makeUser(tx, { name: 'Alice' })
			const bob = await makeUser(tx, { name: 'Bob' })
			const mochi = await makeDependent(tx, { name: 'Mochi', createdByUserId: alice.id, birthMonth: 'march', birthDay: 12 })
			const peanut = await makeDependent(tx, { name: 'Peanut', createdByUserId: bob.id })

			// Alice guards Mochi only; Bob guards both.
			await makeDependentGuardianship(tx, { guardianUserId: alice.id, dependentId: mochi.id })
			await makeDependentGuardianship(tx, { guardianUserId: bob.id, dependentId: mochi.id })
			await makeDependentGuardianship(tx, { guardianUserId: bob.id, dependentId: peanut.id })

			// Lists with subjectDependentId set: these surface in the
			// dependents section, not in the owner's own public/private.
			await makeList(tx, { ownerId: alice.id, name: "Mochi's wishlist", subjectDependentId: mochi.id })
			await makeList(tx, { ownerId: bob.id, name: "Mochi's birthday", subjectDependentId: mochi.id, type: 'birthday' })
			await makeList(tx, { ownerId: bob.id, name: "Peanut's registry", subjectDependentId: peanut.id })

			// Alice's own wishlist - belongs in the regular `public` bucket,
			// NOT under any dependent.
			await makeList(tx, { ownerId: alice.id, name: "Alice's wishlist" })

			// Use a transaction wrapper that pretends to be the live db so
			// getMyListsImpl can issue its own queries via the global db.
			// Actually, getMyListsImpl uses `db` directly (not a passed-in
			// dbx), so we have to set up the data through the same tx that
			// the impl reads from. The setup mocks `@/db` to the test db,
			// so this works as long as the call happens inside withRollback.
			const result = await getMyListsImpl(alice.id, tx)

			expect(result.dependents).toHaveLength(1)
			const mochiGroup = result.dependents[0]
			expect(mochiGroup.dependentId).toBe(mochi.id)
			expect(mochiGroup.dependentName).toBe('Mochi')
			expect(mochiGroup.birthMonth).toBe('march')
			expect(mochiGroup.birthDay).toBe(12)
			// Both lists for Mochi appear, sorted alphabetically.
			expect(mochiGroup.lists.map(l => l.name)).toEqual(["Mochi's birthday", "Mochi's wishlist"])
			expect(mochiGroup.lists.every(l => l.subjectDependentId === mochi.id)).toBe(true)

			// Alice's own list goes to the `public` bucket and the
			// dependents section doesn't accidentally include it.
			expect(result.public.map(l => l.name)).toContain("Alice's wishlist")
			expect(result.public.some(l => l.name.includes('Mochi'))).toBe(false)
		})
	})

	it('does not include archived dependents in the section, even when guardianships still exist', async () => {
		await withRollback(async tx => {
			const alice = await makeUser(tx)
			const archived = await makeDependent(tx, { name: 'Old Yeller', createdByUserId: alice.id, isArchived: true })
			await makeDependentGuardianship(tx, { guardianUserId: alice.id, dependentId: archived.id })
			await makeList(tx, { ownerId: alice.id, name: "Old Yeller's wishlist", subjectDependentId: archived.id })

			const result = await getMyListsImpl(alice.id, tx)
			expect(result.dependents).toEqual([])
		})
	})

	it('counts items on the dependent-subject lists (excluding archived items)', async () => {
		await withRollback(async tx => {
			const alice = await makeUser(tx)
			const dep = await makeDependent(tx, { createdByUserId: alice.id })
			await makeDependentGuardianship(tx, { guardianUserId: alice.id, dependentId: dep.id })
			const list = await makeList(tx, { ownerId: alice.id, subjectDependentId: dep.id })
			await makeItem(tx, { listId: list.id, isArchived: false })
			await makeItem(tx, { listId: list.id, isArchived: false })
			await makeItem(tx, { listId: list.id, isArchived: true })

			const result = await getMyListsImpl(alice.id, tx)
			expect(result.dependents).toHaveLength(1)
			expect(result.dependents[0].lists[0]?.itemCount).toBe(2)
		})
	})

	it('returns an empty dependents array for guardians with no dependents', async () => {
		await withRollback(async tx => {
			const carol = await makeUser(tx)
			const result = await getMyListsImpl(carol.id, tx)
			expect(result.dependents).toEqual([])
			expect(Array.isArray(result.dependents)).toBe(true)
		})
	})
})
