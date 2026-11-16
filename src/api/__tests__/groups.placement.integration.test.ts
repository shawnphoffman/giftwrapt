// Items joining a group always get a `groupSortOrder`, and an untouched
// empty group takes the highest priority of the items put into it. Both
// used to be left to the owner: positions only existed after the arrows
// were used, so a hand-made "in order" group enforced nothing.

import { makeGiftedItem, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { asc, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { claimItemGiftImpl } from '@/api/_gifts-impl'
import { assignItemsToGroupImpl } from '@/api/_groups-impl'
import { createItemImpl } from '@/api/_items-impl'
import { itemGroups, items } from '@/db/schema'

type Tx = Parameters<Parameters<typeof withRollback>[0]>[0]

async function makeGroup(tx: Tx, listId: number, type: 'or' | 'order' = 'order') {
	const [group] = await tx.insert(itemGroups).values({ listId, type }).returning()
	return group
}

async function membersOf(tx: Tx, groupId: number) {
	return tx
		.select({ id: items.id, groupSortOrder: items.groupSortOrder })
		.from(items)
		.where(eq(items.groupId, groupId))
		.orderBy(asc(items.groupSortOrder))
}

describe('group placement', () => {
	it('gives assigned items positions in the order sent, and appends later ones', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const group = await makeGroup(tx, list.id)
			const a = await makeItem(tx, { listId: list.id })
			const b = await makeItem(tx, { listId: list.id })
			const c = await makeItem(tx, { listId: list.id })

			const first = await assignItemsToGroupImpl({ userId: owner.id, input: { groupId: group.id, itemIds: [b.id, a.id] }, dbx: tx })
			expect(first.kind).toBe('ok')
			// Re-sending a member with a new item keeps the member's place.
			const second = await assignItemsToGroupImpl({ userId: owner.id, input: { groupId: group.id, itemIds: [b.id, c.id] }, dbx: tx })
			expect(second.kind).toBe('ok')

			expect(await membersOf(tx, group.id)).toEqual([
				{ id: b.id, groupSortOrder: 0 },
				{ id: a.id, groupSortOrder: 1 },
				{ id: c.id, groupSortOrder: 2 },
			])
		})
	})

	it('clears the position when an item leaves its group', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const group = await makeGroup(tx, list.id)
			const a = await makeItem(tx, { listId: list.id })
			await assignItemsToGroupImpl({ userId: owner.id, input: { groupId: group.id, itemIds: [a.id] }, dbx: tx })
			await assignItemsToGroupImpl({ userId: owner.id, input: { groupId: null, itemIds: [a.id] }, dbx: tx })

			const row = await tx.query.items.findFirst({ where: eq(items.id, a.id), columns: { groupId: true, groupSortOrder: true } })
			expect(row).toEqual({ groupId: null, groupSortOrder: null })
		})
	})

	it('enforces the order of a hand-made in-order group', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const group = await makeGroup(tx, list.id)
			const helmet = await makeItem(tx, { listId: list.id, title: 'Helmet' })
			const bike = await makeItem(tx, { listId: list.id, title: 'Bike' })
			await assignItemsToGroupImpl({ userId: owner.id, input: { groupId: group.id, itemIds: [helmet.id, bike.id] }, dbx: tx })

			const early = await claimItemGiftImpl({ gifterId: gifter.id, input: { itemId: bike.id, quantity: 1, totalCost: undefined }, dbx: tx })
			expect(early).toMatchObject({ kind: 'error', reason: 'group-out-of-order', blockingItemTitle: 'Helmet' })

			await makeGiftedItem(tx, { itemId: helmet.id, gifterId: gifter.id })
			const after = await claimItemGiftImpl({ gifterId: gifter.id, input: { itemId: bike.id, quantity: 1, totalCost: undefined }, dbx: tx })
			expect(after.kind).toBe('ok')
		})
	})

	it('gives an empty default group the highest priority of the items joining it', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const group = await makeGroup(tx, list.id)
			const a = await makeItem(tx, { listId: list.id, priority: 'high' })
			const b = await makeItem(tx, { listId: list.id, priority: 'very-high' })
			await assignItemsToGroupImpl({ userId: owner.id, input: { groupId: group.id, itemIds: [a.id, b.id] }, dbx: tx })

			const row = await tx.query.itemGroups.findFirst({ where: eq(itemGroups.id, group.id), columns: { priority: true } })
			expect(row?.priority).toBe('very-high')
		})
	})

	it('keeps the priority of a group that has members or was given one', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const populated = await makeGroup(tx, list.id)
			const chosen = await makeGroup(tx, list.id)
			await tx.update(itemGroups).set({ priority: 'low' }).where(eq(itemGroups.id, chosen.id))
			const first = await makeItem(tx, { listId: list.id })
			const later = await makeItem(tx, { listId: list.id, priority: 'very-high' })
			const other = await makeItem(tx, { listId: list.id, priority: 'very-high' })

			await assignItemsToGroupImpl({ userId: owner.id, input: { groupId: populated.id, itemIds: [first.id] }, dbx: tx })
			await assignItemsToGroupImpl({ userId: owner.id, input: { groupId: populated.id, itemIds: [later.id] }, dbx: tx })
			await assignItemsToGroupImpl({ userId: owner.id, input: { groupId: chosen.id, itemIds: [other.id] }, dbx: tx })

			const rows = await tx
				.select({ id: itemGroups.id, priority: itemGroups.priority })
				.from(itemGroups)
				.where(eq(itemGroups.listId, list.id))
			expect(rows.find(r => r.id === populated.id)?.priority).toBe('normal')
			expect(rows.find(r => r.id === chosen.id)?.priority).toBe('low')
		})
	})

	it('places an item created straight into a group, and ignores a group from another list', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const otherList = await makeList(tx, { ownerId: owner.id })
			const group = await makeGroup(tx, list.id)
			const foreign = await makeGroup(tx, otherList.id)
			const existing = await makeItem(tx, { listId: list.id })
			await assignItemsToGroupImpl({ userId: owner.id, input: { groupId: group.id, itemIds: [existing.id] }, dbx: tx })

			const inGroup = await createItemImpl({
				db: tx,
				actor: { id: owner.id },
				input: { listId: list.id, title: 'Second', groupId: group.id },
			})
			const stray = await createItemImpl({
				db: tx,
				actor: { id: owner.id },
				input: { listId: list.id, title: 'Stray', groupId: foreign.id },
			})
			if (inGroup.kind !== 'ok' || stray.kind !== 'ok') throw new Error('expected items')

			expect(inGroup.item).toMatchObject({ groupId: group.id, groupSortOrder: 1 })
			expect(stray.item).toMatchObject({ groupId: null, groupSortOrder: null })
		})
	})
})
