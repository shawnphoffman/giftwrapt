// Integration coverage for the dependents half of the home feed
// (`getPublicDependentsImpl`). The feed must agree with canViewList and
// the restricted item filter: a guardian's `none` hides the dependent
// entirely, and `restricted` counts only the items the viewer could see
// on the list itself.

import {
	makeDependent,
	makeDependentGuardianship,
	makeGiftedItem,
	makeItem,
	makeList,
	makeUser,
	makeUserRelationship,
} from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { getPublicDependentsImpl } from '@/api/_lists-impl'
import type { SchemaDatabase } from '@/db'

// Two guardians, one public list about the dependent with one open item
// and one item claimed by a stranger.
async function seedDependentWithList(tx: SchemaDatabase) {
	const guardianA = await makeUser(tx)
	const guardianB = await makeUser(tx)
	const viewer = await makeUser(tx)
	const stranger = await makeUser(tx)
	const dependent = await makeDependent(tx, { createdByUserId: guardianA.id })
	await makeDependentGuardianship(tx, { guardianUserId: guardianA.id, dependentId: dependent.id })
	await makeDependentGuardianship(tx, { guardianUserId: guardianB.id, dependentId: dependent.id })
	const list = await makeList(tx, { ownerId: guardianA.id, subjectDependentId: dependent.id })
	await makeItem(tx, { listId: list.id, title: 'open' })
	const claimed = await makeItem(tx, { listId: list.id, title: 'claimed' })
	await makeGiftedItem(tx, { itemId: claimed.id, gifterId: stranger.id })
	return { guardianA, guardianB, viewer, dependent, list }
}

describe('getPublicDependentsImpl', () => {
	it('shows the dependent with full counts to an ordinary viewer', async () => {
		await withRollback(async tx => {
			const { viewer, dependent, list } = await seedDependentWithList(tx)

			const feed = await getPublicDependentsImpl(viewer.id, tx)
			const entry = feed.find(d => d.id === dependent.id)
			expect(entry?.lists.map(l => l.id)).toEqual([list.id])
			expect(entry?.lists[0]).toMatchObject({ itemsTotal: 2, itemsRemaining: 1 })
		})
	})

	it("hides the dependent when any guardian set the viewer to 'none'", async () => {
		await withRollback(async tx => {
			const { guardianB, viewer, dependent } = await seedDependentWithList(tx)
			// The list's owner is guardian A; the denial comes from B.
			await makeUserRelationship(tx, { ownerUserId: guardianB.id, viewerUserId: viewer.id, accessLevel: 'none' })

			const feed = await getPublicDependentsImpl(viewer.id, tx)
			expect(feed.find(d => d.id === dependent.id)).toBeUndefined()
		})
	})

	it('counts only items a restricted viewer can see', async () => {
		await withRollback(async tx => {
			const { guardianA, viewer, dependent } = await seedDependentWithList(tx)
			await makeUserRelationship(tx, { ownerUserId: guardianA.id, viewerUserId: viewer.id, accessLevel: 'restricted' })

			const feed = await getPublicDependentsImpl(viewer.id, tx)
			const entry = feed.find(d => d.id === dependent.id)
			// The stranger-claimed item is hidden, so it doesn't count.
			expect(entry?.lists[0]).toMatchObject({ itemsTotal: 1, itemsRemaining: 1 })
		})
	})
})
