// Integration coverage for the user-relation-labels API impls. Asserts
// validation rules (self-target, target existence, dependent guardian
// requirement, idempotency) and that get/add/remove round-trip
// correctly for both user and dependent targets.

import { makeDependent, makeDependentGuardianship, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { addRelationLabelImpl, getMyRelationLabelsImpl, removeRelationLabelImpl } from '@/api/_relation-labels-impl'

describe('relation-labels API', () => {
	it('returns rows with resolved user targets', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx, { name: 'Me' })
			const mom = await makeUser(tx, { name: 'Mom' })

			const add = await addRelationLabelImpl({ userId: me.id, input: { label: 'mother', targetUserId: mom.id }, dbx: tx })
			expect(add.kind).toBe('ok')

			const rows = await getMyRelationLabelsImpl({ userId: me.id, dbx: tx })
			expect(rows).toHaveLength(1)
			expect(rows[0]).toMatchObject({ label: 'mother' })
			expect(rows[0].target.kind).toBe('user')
			if (rows[0].target.kind === 'user') {
				expect(rows[0].target.id).toBe(mom.id)
				expect(rows[0].target.name).toBe('Mom')
			}
		})
	})

	it('returns rows with resolved dependent targets when caller is a guardian', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx)
			const dep = await makeDependent(tx, { name: 'Pet Mom', createdByUserId: me.id })
			await makeDependentGuardianship(tx, { guardianUserId: me.id, dependentId: dep.id })

			const add = await addRelationLabelImpl({ userId: me.id, input: { label: 'mother', targetDependentId: dep.id }, dbx: tx })
			expect(add.kind).toBe('ok')

			const rows = await getMyRelationLabelsImpl({ userId: me.id, dbx: tx })
			expect(rows).toHaveLength(1)
			expect(rows[0].target.kind).toBe('dependent')
			if (rows[0].target.kind === 'dependent') {
				expect(rows[0].target.id).toBe(dep.id)
				expect(rows[0].target.name).toBe('Pet Mom')
			}
		})
	})

	it('rejects self-target', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx)
			const result = await addRelationLabelImpl({ userId: me.id, input: { label: 'mother', targetUserId: me.id }, dbx: tx })
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('self-target')
		})
	})

	it('rejects an unknown user target', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx)
			const result = await addRelationLabelImpl({ userId: me.id, input: { label: 'mother', targetUserId: 'nobody-here' }, dbx: tx })
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('target-not-found')
		})
	})

	it('rejects a dependent target the caller does not guard', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx)
			const stranger = await makeUser(tx)
			const dep = await makeDependent(tx, { name: 'Their Mom', createdByUserId: stranger.id })
			await makeDependentGuardianship(tx, { guardianUserId: stranger.id, dependentId: dep.id })

			const result = await addRelationLabelImpl({ userId: me.id, input: { label: 'mother', targetDependentId: dep.id }, dbx: tx })
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('not-dependent-guardian')
		})
	})

	it('returns duplicate on a second add of the same target+label', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx)
			const mom = await makeUser(tx)
			const first = await addRelationLabelImpl({ userId: me.id, input: { label: 'mother', targetUserId: mom.id }, dbx: tx })
			expect(first.kind).toBe('ok')
			const second = await addRelationLabelImpl({ userId: me.id, input: { label: 'mother', targetUserId: mom.id }, dbx: tx })
			expect(second.kind).toBe('error')
			if (second.kind === 'error') expect(second.reason).toBe('duplicate')
		})
	})

	it('treats different labels for the same target as distinct rows', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx)
			const someone = await makeUser(tx, { name: 'Pat' })
			const mother = await addRelationLabelImpl({ userId: me.id, input: { label: 'mother', targetUserId: someone.id }, dbx: tx })
			const father = await addRelationLabelImpl({ userId: me.id, input: { label: 'father', targetUserId: someone.id }, dbx: tx })
			expect(mother.kind).toBe('ok')
			expect(father.kind).toBe('ok')
			const rows = await getMyRelationLabelsImpl({ userId: me.id, dbx: tx })
			expect(rows).toHaveLength(2)
		})
	})

	it('removes a row that belongs to the caller', async () => {
		await withRollback(async tx => {
			const me = await makeUser(tx)
			const mom = await makeUser(tx)
			const add = await addRelationLabelImpl({ userId: me.id, input: { label: 'mother', targetUserId: mom.id }, dbx: tx })
			if (add.kind !== 'ok') throw new Error('add failed')

			const remove = await removeRelationLabelImpl({ userId: me.id, input: { id: add.id }, dbx: tx })
			expect(remove.kind).toBe('ok')

			const rows = await getMyRelationLabelsImpl({ userId: me.id, dbx: tx })
			expect(rows).toHaveLength(0)
		})
	})

	it("does not let one user remove another user's row", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const mom = await makeUser(tx)
			const stranger = await makeUser(tx)
			const add = await addRelationLabelImpl({ userId: owner.id, input: { label: 'mother', targetUserId: mom.id }, dbx: tx })
			if (add.kind !== 'ok') throw new Error('add failed')

			const result = await removeRelationLabelImpl({ userId: stranger.id, input: { id: add.id }, dbx: tx })
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.reason).toBe('not-found')

			// Original row survives.
			const rows = await getMyRelationLabelsImpl({ userId: owner.id, dbx: tx })
			expect(rows).toHaveLength(1)
		})
	})
})
