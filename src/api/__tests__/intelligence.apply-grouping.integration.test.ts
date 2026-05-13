import { randomUUID } from 'node:crypto'

import { makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { eq, inArray } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { applyRecommendationImpl } from '@/api/intelligence'
import { itemGroups, items, listEditors, recommendations } from '@/db/schema'

async function makeGroupRec(
	tx: Parameters<Parameters<typeof withRollback>[0]>[0],
	args: { userId: string; status?: 'active' | 'dismissed' | 'applied' }
) {
	const [row] = await tx
		.insert(recommendations)
		.values({
			userId: args.userId,
			batchId: randomUUID(),
			analyzerId: 'grouping',
			kind: 'group-suggestion',
			fingerprint: `test-${randomUUID()}`,
			status: args.status ?? 'active',
			severity: 'suggest',
			title: 'Group these',
			body: 'These items look like a group',
			payload: {},
		})
		.returning()
	return row
}

describe('applyRecommendationImpl - create-group', () => {
	it('creates an or-group, sets groupId on each item, and marks the rec applied', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const itemA = await makeItem(tx, { listId: list.id, title: 'Weber Spirit grill' })
			const itemB = await makeItem(tx, { listId: list.id, title: 'Traeger Pro 575 grill' })
			const rec = await makeGroupRec(tx, { userId: owner.id })

			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: {
					kind: 'create-group',
					listId: String(list.id),
					groupType: 'or',
					itemIds: [String(itemA.id), String(itemB.id)],
					priority: 'high',
				},
			})

			expect(result.ok).toBe(true)
			if (!result.ok) return // narrow
			if (result.kind !== 'create-group') throw new Error('expected create-group result')

			const groupRow = await tx.query.itemGroups.findFirst({
				where: eq(itemGroups.id, Number.parseInt(result.groupId, 10)),
			})
			expect(groupRow?.type).toBe('or')
			expect(groupRow?.priority).toBe('high')
			expect(groupRow?.listId).toBe(list.id)

			const updatedItems = await tx
				.select({ id: items.id, groupId: items.groupId, groupSortOrder: items.groupSortOrder })
				.from(items)
				.where(inArray(items.id, [itemA.id, itemB.id]))
			const byId = new Map(updatedItems.map(r => [r.id, r]))
			expect(byId.get(itemA.id)?.groupId).toBe(groupRow?.id)
			expect(byId.get(itemB.id)?.groupId).toBe(groupRow?.id)
			expect(byId.get(itemA.id)?.groupSortOrder).toBe(0)
			expect(byId.get(itemB.id)?.groupSortOrder).toBe(1)

			const recAfter = await tx.query.recommendations.findFirst({ where: eq(recommendations.id, rec.id) })
			expect(recAfter?.status).toBe('applied')
		})
	})

	it('preserves groupSortOrder for an order-group based on input order', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const console_ = await makeItem(tx, { listId: list.id, title: 'PlayStation 5' })
			const ctrl1 = await makeItem(tx, { listId: list.id, title: 'PS5 controller white' })
			const ctrl2 = await makeItem(tx, { listId: list.id, title: 'PS5 controller red' })
			const rec = await makeGroupRec(tx, { userId: owner.id })

			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: {
					kind: 'create-group',
					listId: String(list.id),
					groupType: 'order',
					itemIds: [String(console_.id), String(ctrl1.id), String(ctrl2.id)],
					priority: 'normal',
				},
			})
			expect(result.ok).toBe(true)

			const updated = await tx
				.select({ id: items.id, groupSortOrder: items.groupSortOrder })
				.from(items)
				.where(inArray(items.id, [console_.id, ctrl1.id, ctrl2.id]))
			const byId = new Map(updated.map(r => [r.id, r.groupSortOrder]))
			expect(byId.get(console_.id)).toBe(0)
			expect(byId.get(ctrl1.id)).toBe(1)
			expect(byId.get(ctrl2.id)).toBe(2)
		})
	})

	it('rejects when one of the items is already grouped', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const [{ id: existingGroupId }] = await tx
				.insert(itemGroups)
				.values({ listId: list.id, type: 'or', priority: 'normal' })
				.returning({ id: itemGroups.id })
			const grouped = await makeItem(tx, { listId: list.id, groupId: existingGroupId })
			const free = await makeItem(tx, { listId: list.id })
			const rec = await makeGroupRec(tx, { userId: owner.id })

			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: {
					kind: 'create-group',
					listId: String(list.id),
					groupType: 'or',
					itemIds: [String(grouped.id), String(free.id)],
					priority: 'normal',
				},
			})
			expect(result).toEqual({ ok: false, reason: 'items-changed' })

			const recAfter = await tx.query.recommendations.findFirst({ where: eq(recommendations.id, rec.id) })
			expect(recAfter?.status).toBe('active')
		})
	})

	it('rejects when the rec is already applied', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const a = await makeItem(tx, { listId: list.id })
			const b = await makeItem(tx, { listId: list.id })
			const rec = await makeGroupRec(tx, { userId: owner.id, status: 'applied' })

			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: {
					kind: 'create-group',
					listId: String(list.id),
					groupType: 'or',
					itemIds: [String(a.id), String(b.id)],
					priority: 'normal',
				},
			})
			expect(result).toEqual({ ok: false, reason: 'rec-not-active' })
		})
	})

	it('rejects when the user cannot edit the list', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const stranger = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const a = await makeItem(tx, { listId: list.id })
			const b = await makeItem(tx, { listId: list.id })
			const rec = await makeGroupRec(tx, { userId: stranger.id })

			const result = await applyRecommendationImpl(tx, stranger.id, {
				id: rec.id,
				apply: {
					kind: 'create-group',
					listId: String(list.id),
					groupType: 'or',
					itemIds: [String(a.id), String(b.id)],
					priority: 'normal',
				},
			})
			expect(result).toEqual({ ok: false, reason: 'cannot-edit' })
		})
	})

	it('allows a list editor to apply', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const editor = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			await tx.insert(listEditors).values({ listId: list.id, userId: editor.id, ownerId: owner.id })
			const a = await makeItem(tx, { listId: list.id })
			const b = await makeItem(tx, { listId: list.id })
			const rec = await makeGroupRec(tx, { userId: editor.id })

			const result = await applyRecommendationImpl(tx, editor.id, {
				id: rec.id,
				apply: {
					kind: 'create-group',
					listId: String(list.id),
					groupType: 'or',
					itemIds: [String(a.id), String(b.id)],
					priority: 'normal',
				},
			})
			expect(result.ok).toBe(true)
		})
	})

	it('rejects when an item lives on a different list than apply.listId', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const listA = await makeList(tx, { ownerId: owner.id })
			const listB = await makeList(tx, { ownerId: owner.id })
			const onA = await makeItem(tx, { listId: listA.id })
			const onB = await makeItem(tx, { listId: listB.id })
			const rec = await makeGroupRec(tx, { userId: owner.id })

			const result = await applyRecommendationImpl(tx, owner.id, {
				id: rec.id,
				apply: {
					kind: 'create-group',
					listId: String(listA.id),
					groupType: 'or',
					itemIds: [String(onA.id), String(onB.id)],
					priority: 'normal',
				},
			})
			expect(result).toEqual({ ok: false, reason: 'items-changed' })
		})
	})
})
