import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import {
	addGuardianImpl,
	createDependentImpl,
	deleteDependentImpl,
	getMyDependentsImpl,
	removeGuardianImpl,
	updateDependentImpl,
} from '@/api/_dependents-impl'
import { dependentGuardianships, dependents, lists } from '@/db/schema'
import { canEditList, canViewList } from '@/lib/permissions'

import { makeDependent, makeDependentGuardianship, makeGiftedItem, makeItem, makeList, makeUser } from '../../../test/integration/factories'
import { withRollback } from '../../../test/integration/setup'

describe('createDependentImpl', () => {
	it('inserts the dependent + guardianship rows for the supplied guardians', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const alice = await makeUser(tx)
			const bob = await makeUser(tx)

			const result = await createDependentImpl({
				userId: admin.id,
				input: { name: 'Mochi', guardianIds: [alice.id, bob.id] },
				dbx: tx,
			})

			expect(result.kind).toBe('ok')
			if (result.kind !== 'ok') return
			expect(result.dependent.name).toBe('Mochi')
			expect(result.dependent.guardianIds.sort()).toEqual([alice.id, bob.id].sort())

			const inserted = await tx.query.dependents.findFirst({ where: eq(dependents.id, result.dependent.id) })
			expect(inserted?.createdByUserId).toBe(admin.id)
		})
	})

	it('rejects child users as guardians', async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const child = await makeUser(tx, { role: 'child' })

			const result = await createDependentImpl({
				userId: admin.id,
				input: { name: 'Pup', guardianIds: [child.id] },
				dbx: tx,
			})

			expect(result).toEqual({ kind: 'error', reason: 'guardian-role-not-allowed' })
		})
	})

	it("returns 'guardian-not-found' if any guardian id doesn't exist", async () => {
		await withRollback(async tx => {
			const admin = await makeUser(tx, { role: 'admin' })
			const alice = await makeUser(tx)

			const result = await createDependentImpl({
				userId: admin.id,
				input: { name: 'Mochi', guardianIds: [alice.id, 'user_does_not_exist'] },
				dbx: tx,
			})

			expect(result).toEqual({ kind: 'error', reason: 'guardian-not-found' })
		})
	})
})

describe('updateDependentImpl', () => {
	it('renames a dependent and clears birthday fields', async () => {
		await withRollback(async tx => {
			const alice = await makeUser(tx)
			const dep = await makeDependent(tx, {
				createdByUserId: alice.id,
				name: 'Old Name',
				birthMonth: 'march',
				birthDay: 14,
				birthYear: 2020,
			})

			const r = await updateDependentImpl({ input: { id: dep.id, name: 'New Name', birthYear: null }, dbx: tx })
			expect(r.kind).toBe('ok')
			if (r.kind !== 'ok') return
			expect(r.dependent.name).toBe('New Name')
			expect(r.dependent.birthYear).toBeNull()
			// Unspecified fields are not touched.
			expect(r.dependent.birthMonth).toBe('march')
			expect(r.dependent.birthDay).toBe(14)
		})
	})

	it("returns 'not-found' when the dependent doesn't exist", async () => {
		await withRollback(async tx => {
			const r = await updateDependentImpl({ input: { id: 'nope', name: 'X' }, dbx: tx })
			expect(r).toEqual({ kind: 'error', reason: 'not-found' })
		})
	})
})

describe('deleteDependentImpl', () => {
	it('hard-deletes a dependent with no claim history', async () => {
		await withRollback(async tx => {
			const alice = await makeUser(tx)
			const dep = await makeDependent(tx, { createdByUserId: alice.id })
			await makeDependentGuardianship(tx, { guardianUserId: alice.id, dependentId: dep.id })
			const list = await makeList(tx, { ownerId: alice.id, subjectDependentId: dep.id })

			const r = await deleteDependentImpl({ id: dep.id, dbx: tx })
			expect(r).toEqual({ kind: 'ok', action: 'deleted' })

			expect(await tx.query.dependents.findFirst({ where: eq(dependents.id, dep.id) })).toBeUndefined()
			// FK cascade removes the dependent's lists and guardianships.
			expect(await tx.query.lists.findFirst({ where: eq(lists.id, list.id) })).toBeUndefined()
		})
	})

	it('archives instead of deleting when any list with this subject has a claim', async () => {
		await withRollback(async tx => {
			const alice = await makeUser(tx)
			const bob = await makeUser(tx)
			const dep = await makeDependent(tx, { createdByUserId: alice.id })
			await makeDependentGuardianship(tx, { guardianUserId: alice.id, dependentId: dep.id })
			const list = await makeList(tx, { ownerId: alice.id, subjectDependentId: dep.id })
			const item = await makeItem(tx, { listId: list.id })
			await makeGiftedItem(tx, { itemId: item.id, gifterId: bob.id })

			const r = await deleteDependentImpl({ id: dep.id, dbx: tx })
			expect(r).toEqual({ kind: 'ok', action: 'archived' })

			const stillThere = await tx.query.dependents.findFirst({ where: eq(dependents.id, dep.id) })
			expect(stillThere?.isArchived).toBe(true)

			const archivedList = await tx.query.lists.findFirst({ where: eq(lists.id, list.id) })
			expect(archivedList?.isActive).toBe(false)
		})
	})
})

describe('addGuardianImpl / removeGuardianImpl', () => {
	it('adds a new guardian and rejects child users', async () => {
		await withRollback(async tx => {
			const alice = await makeUser(tx)
			const bob = await makeUser(tx)
			const child = await makeUser(tx, { role: 'child' })
			const dep = await makeDependent(tx, { createdByUserId: alice.id })
			await makeDependentGuardianship(tx, { guardianUserId: alice.id, dependentId: dep.id })

			const ok = await addGuardianImpl({ input: { dependentId: dep.id, userId: bob.id }, dbx: tx })
			expect(ok).toEqual({ kind: 'ok' })

			const denied = await addGuardianImpl({ input: { dependentId: dep.id, userId: child.id }, dbx: tx })
			expect(denied).toEqual({ kind: 'error', reason: 'guardian-role-not-allowed' })
		})
	})

	it('refuses to remove the last guardian (the dependent would be unmanageable)', async () => {
		await withRollback(async tx => {
			const alice = await makeUser(tx)
			const dep = await makeDependent(tx, { createdByUserId: alice.id })
			await makeDependentGuardianship(tx, { guardianUserId: alice.id, dependentId: dep.id })

			const r = await removeGuardianImpl({ input: { dependentId: dep.id, userId: alice.id }, dbx: tx })
			expect(r).toEqual({ kind: 'error', reason: 'last-guardian' })

			const stillThere = await tx.query.dependentGuardianships.findFirst({
				where: eq(dependentGuardianships.dependentId, dep.id),
			})
			expect(stillThere).toBeDefined()
		})
	})
})

describe('canViewList / canEditList for dependent-subject lists', () => {
	it('grants any guardian full view + edit, regardless of privacy', async () => {
		await withRollback(async tx => {
			const alice = await makeUser(tx)
			const bob = await makeUser(tx)
			const stranger = await makeUser(tx)
			const dep = await makeDependent(tx, { createdByUserId: alice.id })
			await makeDependentGuardianship(tx, { guardianUserId: alice.id, dependentId: dep.id })
			await makeDependentGuardianship(tx, { guardianUserId: bob.id, dependentId: dep.id })

			const privateList = await makeList(tx, {
				ownerId: alice.id,
				subjectDependentId: dep.id,
				isPrivate: true,
			})
			const listShape = {
				id: privateList.id,
				ownerId: privateList.ownerId,
				subjectDependentId: privateList.subjectDependentId ?? null,
				isPrivate: privateList.isPrivate,
				isActive: privateList.isActive,
			}

			// Both guardians can view + edit, even on a private list.
			expect(await canViewList(alice.id, listShape, tx)).toEqual({ ok: true })
			expect(await canViewList(bob.id, listShape, tx)).toEqual({ ok: true })
			expect((await canEditList(alice.id, listShape, tx)).ok).toBe(true)
			expect((await canEditList(bob.id, listShape, tx)).ok).toBe(true)

			// Strangers can't see a private dependent list.
			const view = await canViewList(stranger.id, listShape, tx)
			expect(view.ok).toBe(false)
		})
	})
})

describe('getMyDependentsImpl', () => {
	it('returns only the dependents the caller is a guardian of, with createdByMe flag', async () => {
		await withRollback(async tx => {
			const alice = await makeUser(tx)
			const bob = await makeUser(tx)
			const carol = await makeUser(tx)

			const aliceDep = await makeDependent(tx, { createdByUserId: alice.id })
			await makeDependentGuardianship(tx, { guardianUserId: alice.id, dependentId: aliceDep.id })
			await makeDependentGuardianship(tx, { guardianUserId: bob.id, dependentId: aliceDep.id })

			const carolDep = await makeDependent(tx, { createdByUserId: carol.id })
			await makeDependentGuardianship(tx, { guardianUserId: carol.id, dependentId: carolDep.id })

			const aliceView = await getMyDependentsImpl({ userId: alice.id, dbx: tx })
			expect(aliceView.dependents.map(d => d.id)).toEqual([aliceDep.id])
			expect(aliceView.dependents[0].createdByMe).toBe(true)

			const bobView = await getMyDependentsImpl({ userId: bob.id, dbx: tx })
			expect(bobView.dependents.map(d => d.id)).toEqual([aliceDep.id])
			expect(bobView.dependents[0].createdByMe).toBe(false)
		})
	})
})
