// Visibility-predicate coverage: seed the four points of the
// {isArchived × pendingDeletionAt} cartesian, then assert each mode of
// `visibleItemsWhere` selects the documented subset.

import { makeItem, makeList, makeUser } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { items } from '@/db/schema'
import { type ItemVisibility, visibleItemsWhere } from '@/lib/item-visibility'

const PENDING = new Date('2026-05-13T00:00:00Z')

async function seedCartesian(tx: Parameters<Parameters<typeof withRollback>[0]>[0], listId: number): Promise<void> {
	await makeItem(tx, { listId, title: 'active', isArchived: false, pendingDeletionAt: null })
	await makeItem(tx, { listId, title: 'archived', isArchived: true, pendingDeletionAt: null })
	await makeItem(tx, { listId, title: 'pending-active', isArchived: false, pendingDeletionAt: PENDING })
	await makeItem(tx, { listId, title: 'pending-archived', isArchived: true, pendingDeletionAt: PENDING })
}

async function selectTitles(
	tx: Parameters<Parameters<typeof withRollback>[0]>[0],
	listId: number,
	mode: ItemVisibility
): Promise<Array<string>> {
	const rows = await tx
		.select({ title: items.title })
		.from(items)
		.where(and(eq(items.listId, listId), visibleItemsWhere(mode)))
	return rows.map(r => r.title).sort()
}

describe('visibleItemsWhere', () => {
	it("'visible' selects only non-archived, non-pending items", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			await seedCartesian(tx, list.id)

			expect(await selectTitles(tx, list.id, 'visible')).toEqual(['active'])
		})
	})

	it("'editable' includes archived but excludes pending-deletion", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			await seedCartesian(tx, list.id)

			expect(await selectTitles(tx, list.id, 'editable')).toEqual(['active', 'archived'])
		})
	})

	it("'revealed' selects only archived, non-pending items", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			await seedCartesian(tx, list.id)

			expect(await selectTitles(tx, list.id, 'revealed')).toEqual(['archived'])
		})
	})

	it("'pending-deletion' selects every pending row regardless of archived state", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			await seedCartesian(tx, list.id)

			expect(await selectTitles(tx, list.id, 'pending-deletion')).toEqual(['pending-active', 'pending-archived'])
		})
	})
})
