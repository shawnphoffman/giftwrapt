// Archiving the revealed pick of an 'or' ("pick one") group archives the
// group's other items: the recipient asked for one and has it. An archive
// that leaves a group with no visible items deletes the group. See
// docs/logic.md "Item groups gate claiming".

import { makeGiftedItem, makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq, inArray } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { archiveItemImpl } from '@/api/_items-extra-impl'
import type { SchemaDatabase } from '@/db'
import { itemGroups, items } from '@/db/schema'
import { revealListPurchases } from '@/lib/reveal'

async function makeGroupList(tx: SchemaDatabase, type: 'or' | 'order' = 'or') {
	const owner = await makeUser(tx)
	const gifter = await makeUser(tx)
	const list = await makeList(tx, { ownerId: owner.id, type: 'birthday' })
	const [group] = await tx.insert(itemGroups).values({ listId: list.id, type }).returning()
	const [a, b, c] = await Promise.all(
		[0, 1, 2].map(i => makeItem(tx, { listId: list.id, groupId: group.id, groupSortOrder: i, title: `Option ${i}` }))
	)
	return { owner, gifter, list, group, a, b, c }
}

async function archivedById(tx: SchemaDatabase, ids: Array<number>) {
	const rows = await tx.query.items.findMany({
		where: inArray(items.id, ids),
		columns: { id: true, isArchived: true, archivedAt: true, groupId: true },
	})
	return new Map(rows.map(r => [r.id, r]))
}

async function groupExists(tx: SchemaDatabase, id: number) {
	return (await tx.query.itemGroups.findFirst({ where: eq(itemGroups.id, id), columns: { id: true } })) !== undefined
}

describe('pick-one group archive', () => {
	it('archiving the claimed pick archives its siblings and deletes the group', async () => {
		await withRollback(async tx => {
			const { owner, gifter, group, a, b, c } = await makeGroupList(tx)
			await makeGiftedItem(tx, { itemId: a.id, gifterId: gifter.id })

			expect((await archiveItemImpl({ userId: owner.id, input: { itemId: a.id, archived: true }, dbx: tx })).kind).toBe('ok')
			const rows = await archivedById(tx, [a.id, b.id, c.id])
			expect([a, b, c].map(i => rows.get(i.id)?.isArchived)).toEqual([true, true, true])
			expect(rows.get(b.id)?.archivedAt).not.toBeNull()
			expect(await groupExists(tx, group.id)).toBe(false)
			expect([a, b, c].map(i => rows.get(i.id)?.groupId)).toEqual([null, null, null])
		})
	})

	it('archiving an unclaimed item leaves the group alone', async () => {
		await withRollback(async tx => {
			const { owner, group, a, b, c } = await makeGroupList(tx)

			await archiveItemImpl({ userId: owner.id, input: { itemId: a.id, archived: true }, dbx: tx })
			const rows = await archivedById(tx, [a.id, b.id, c.id])
			expect([a, b, c].map(i => rows.get(i.id)?.isArchived)).toEqual([true, false, false])
			expect(await groupExists(tx, group.id)).toBe(true)
		})
	})

	it('a sibling with a hidden claim keeps every sibling and the group in place', async () => {
		await withRollback(async tx => {
			const { owner, gifter, group, a, b, c } = await makeGroupList(tx)
			// Two claims in one group: possible when items were grouped after
			// being claimed.
			await makeGiftedItem(tx, { itemId: a.id, gifterId: gifter.id })
			await makeGiftedItem(tx, { itemId: b.id, gifterId: gifter.id })

			await archiveItemImpl({ userId: owner.id, input: { itemId: a.id, archived: true }, dbx: tx })
			const rows = await archivedById(tx, [a.id, b.id, c.id])
			expect([a, b, c].map(i => rows.get(i.id)?.isArchived)).toEqual([true, false, false])
			expect(await groupExists(tx, group.id)).toBe(true)
		})
	})

	it('does not cascade in an order group', async () => {
		await withRollback(async tx => {
			const { owner, gifter, group, a, b, c } = await makeGroupList(tx, 'order')
			await makeGiftedItem(tx, { itemId: a.id, gifterId: gifter.id })

			await archiveItemImpl({ userId: owner.id, input: { itemId: a.id, archived: true }, dbx: tx })
			const rows = await archivedById(tx, [a.id, b.id, c.id])
			expect([a, b, c].map(i => rows.get(i.id)?.isArchived)).toEqual([true, false, false])
			expect(await groupExists(tx, group.id)).toBe(true)
		})
	})

	it('archiving the last visible item of any group deletes it', async () => {
		await withRollback(async tx => {
			const { owner, group, a, b, c } = await makeGroupList(tx, 'order')

			for (const i of [a, b]) await archiveItemImpl({ userId: owner.id, input: { itemId: i.id, archived: true }, dbx: tx })
			expect(await groupExists(tx, group.id)).toBe(true)
			await archiveItemImpl({ userId: owner.id, input: { itemId: c.id, archived: true }, dbx: tx })
			expect(await groupExists(tx, group.id)).toBe(false)
		})
	})

	it('leaves an empty group nothing was archived from', async () => {
		await withRollback(async tx => {
			const { owner, list, a } = await makeGroupList(tx)
			const [fresh] = await tx.insert(itemGroups).values({ listId: list.id, type: 'or' }).returning()

			await archiveItemImpl({ userId: owner.id, input: { itemId: a.id, archived: true }, dbx: tx })
			expect(await groupExists(tx, fresh.id)).toBe(true)
		})
	})

	it('unarchiving the pick does not unarchive the siblings', async () => {
		await withRollback(async tx => {
			const { owner, gifter, a, b, c } = await makeGroupList(tx)
			await makeGiftedItem(tx, { itemId: a.id, gifterId: gifter.id })

			await archiveItemImpl({ userId: owner.id, input: { itemId: a.id, archived: true }, dbx: tx })
			await archiveItemImpl({ userId: owner.id, input: { itemId: a.id, archived: false }, dbx: tx })
			const rows = await archivedById(tx, [a.id, b.id, c.id])
			expect([a, b, c].map(i => rows.get(i.id)?.isArchived)).toEqual([false, true, true])
		})
	})

	it('a list reveal archives the siblings and deletes the group but returns only the purchase', async () => {
		await withRollback(async tx => {
			const { gifter, list, group, a, b, c } = await makeGroupList(tx)
			const pendingSibling = await makeItem(tx, { listId: list.id, groupId: group.id, pendingDeletionAt: new Date() })
			await makeGiftedItem(tx, { itemId: a.id, gifterId: gifter.id })
			const now = new Date('2026-03-08T12:00:00Z')

			const revealed = await revealListPurchases(tx, list.id, now)
			expect(revealed.itemIds).toEqual([a.id])
			const rows = await archivedById(tx, [a.id, b.id, c.id, pendingSibling.id])
			expect([a, b, c, pendingSibling].map(i => rows.get(i.id)?.isArchived)).toEqual([true, true, true, false])
			expect(rows.get(c.id)?.archivedAt?.toISOString()).toBe(now.toISOString())
			expect(await groupExists(tx, group.id)).toBe(false)
		})
	})
})
