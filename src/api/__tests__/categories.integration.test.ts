// Item categories (docs/logic.md "Item categories"): optional labels that
// belong to one list, managed by anyone who can edit it, and carried by name
// when a row moves or is copied to another list.

import { makeGiftedItem, makeItem, makeList, makeListEditor, makeUser, makeUserRelationship } from '@test/integration/factories'
import { withRollback } from '@test/integration/setup'
import { asc, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import {
	assignCategoryImpl,
	createCategoryImpl,
	deleteCategoryImpl,
	getCategoryNameSuggestionsImpl,
	getListCategoriesImpl,
	reorderCategoriesImpl,
	updateCategoryImpl,
} from '@/api/_categories-impl'
import { moveGroupToListImpl } from '@/api/_groups-impl'
import { copyItemToListImpl, moveItemsToListImpl } from '@/api/_items-extra-impl'
import { createItemImpl, updateItemImpl } from '@/api/_items-impl'
import { getListForEditingImpl, getListForViewingImpl, getListHeaderImpl } from '@/api/_lists-impl'
import { itemCategories, itemGroups, items } from '@/db/schema'

type Tx = Parameters<Parameters<typeof withRollback>[0]>[0]

async function makeCategory(tx: Tx, listId: number, name: string, sortOrder = 0) {
	const [row] = await tx.insert(itemCategories).values({ listId, name, sortOrder }).returning()
	return row
}

async function makeGroup(tx: Tx, listId: number, categoryId: number | null = null) {
	const [row] = await tx.insert(itemGroups).values({ listId, type: 'or', categoryId }).returning()
	return row
}

async function categoriesOf(tx: Tx, listId: number) {
	return tx
		.select({ id: itemCategories.id, name: itemCategories.name, sortOrder: itemCategories.sortOrder })
		.from(itemCategories)
		.where(eq(itemCategories.listId, listId))
		.orderBy(asc(itemCategories.sortOrder), asc(itemCategories.id))
}

async function itemRow(tx: Tx, id: number) {
	const [row] = await tx.select().from(items).where(eq(items.id, id))
	return row
}

// No item or group on the list may point at another list's category.
async function expectNoStrayCategories(tx: Tx, listId: number) {
	const own = new Set((await categoriesOf(tx, listId)).map(c => c.id))
	const itemRows = await tx.select({ categoryId: items.categoryId }).from(items).where(eq(items.listId, listId))
	const groupRows = await tx.select({ categoryId: itemGroups.categoryId }).from(itemGroups).where(eq(itemGroups.listId, listId))
	for (const row of [...itemRows, ...groupRows]) {
		if (row.categoryId !== null) expect(own.has(row.categoryId)).toBe(true)
	}
}

describe('managing categories', () => {
	it('creates categories at the end of the order and returns them with the list', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })

			const a = await createCategoryImpl({ userId: owner.id, input: { listId: list.id, name: 'Clothes' }, dbx: tx })
			const b = await createCategoryImpl({ userId: owner.id, input: { listId: list.id, name: 'Makeup' }, dbx: tx })
			expect(a.kind).toBe('ok')
			expect(b.kind).toBe('ok')

			const result = await getListForEditingImpl({ userId: owner.id, listId: String(list.id), dbx: tx })
			if (result.kind !== 'ok') throw new Error('expected the list')
			expect(result.list.categories.map(c => c.name)).toEqual(['Clothes', 'Makeup'])
			expect(result.list.categories.map(c => c.sortOrder)).toEqual([0, 1])
		})
	})

	it('refuses a second category with the same name, ignoring case, on create and on rename', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const other = await makeList(tx, { ownerId: owner.id })
			await makeCategory(tx, list.id, 'Clothes')
			const makeup = await makeCategory(tx, list.id, 'Makeup', 1)

			const dup = await createCategoryImpl({ userId: owner.id, input: { listId: list.id, name: 'clothes' }, dbx: tx })
			expect(dup).toEqual({ kind: 'error', reason: 'name-taken' })

			const rename = await updateCategoryImpl({ userId: owner.id, input: { categoryId: makeup.id, name: 'CLOTHES' }, dbx: tx })
			expect(rename).toEqual({ kind: 'error', reason: 'name-taken' })

			// Changing only the case of its own name is fine, and so is the
			// same name on another list.
			expect((await updateCategoryImpl({ userId: owner.id, input: { categoryId: makeup.id, name: 'MAKEUP' }, dbx: tx })).kind).toBe('ok')
			expect((await createCategoryImpl({ userId: owner.id, input: { listId: other.id, name: 'Clothes' }, dbx: tx })).kind).toBe('ok')
		})
	})

	it('lets an editor manage categories and refuses someone who cannot edit the list', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const editor = await makeUser(tx)
			const stranger = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			await makeListEditor(tx, { listId: list.id, userId: editor.id, ownerId: owner.id })

			const made = await createCategoryImpl({ userId: editor.id, input: { listId: list.id, name: 'Clothes' }, dbx: tx })
			if (made.kind !== 'ok') throw new Error('editor should be able to create')
			expect(
				(await updateCategoryImpl({ userId: editor.id, input: { categoryId: made.category.id, name: 'Clothing' }, dbx: tx })).kind
			).toBe('ok')

			expect(await createCategoryImpl({ userId: stranger.id, input: { listId: list.id, name: 'Toys' }, dbx: tx })).toEqual({
				kind: 'error',
				reason: 'not-authorized',
			})
			expect(await deleteCategoryImpl({ userId: stranger.id, input: { categoryId: made.category.id }, dbx: tx })).toEqual({
				kind: 'error',
				reason: 'not-authorized',
			})
			expect(await getCategoryNameSuggestionsImpl({ userId: stranger.id, input: { listId: list.id }, dbx: tx })).toEqual({
				kind: 'error',
				reason: 'not-authorized',
			})
		})
	})

	it("reads one list's categories in order for anyone who can edit it, and for nobody else", async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const editor = await makeUser(tx)
			const stranger = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const other = await makeList(tx, { ownerId: owner.id })
			await makeListEditor(tx, { listId: list.id, userId: editor.id, ownerId: owner.id })
			const toys = await makeCategory(tx, list.id, 'Toys', 1)
			const clothes = await makeCategory(tx, list.id, 'Clothes', 0)
			await makeCategory(tx, other.id, 'Books', 0)

			const expected = {
				kind: 'ok',
				categories: [
					{ id: clothes.id, name: 'Clothes', sortOrder: 0 },
					{ id: toys.id, name: 'Toys', sortOrder: 1 },
				],
			}
			expect(await getListCategoriesImpl({ userId: owner.id, input: { listId: list.id }, dbx: tx })).toEqual(expected)
			expect(await getListCategoriesImpl({ userId: editor.id, input: { listId: list.id }, dbx: tx })).toEqual(expected)
			// A public list's category names are not readable this way by someone
			// who can only view it.
			expect(await getListCategoriesImpl({ userId: stranger.id, input: { listId: list.id }, dbx: tx })).toEqual({
				kind: 'error',
				reason: 'not-authorized',
			})
			expect(await getListCategoriesImpl({ userId: owner.id, input: { listId: 999_999_999 }, dbx: tx })).toEqual({
				kind: 'error',
				reason: 'not-found',
			})
		})
	})

	it('has no categories on a todo list', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const todos = await makeList(tx, { ownerId: owner.id, type: 'todos' })
			expect(await createCategoryImpl({ userId: owner.id, input: { listId: todos.id, name: 'Clothes' }, dbx: tx })).toEqual({
				kind: 'error',
				reason: 'not-found',
			})
		})
	})

	it('reorders, keeping a category that was left out after the ones sent', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const a = await makeCategory(tx, list.id, 'A', 0)
			const b = await makeCategory(tx, list.id, 'B', 1)
			const c = await makeCategory(tx, list.id, 'C', 2)

			const result = await reorderCategoriesImpl({ userId: owner.id, input: { listId: list.id, categoryIds: [c.id, a.id] }, dbx: tx })
			expect(result.kind).toBe('ok')
			expect((await categoriesOf(tx, list.id)).map(x => x.name)).toEqual(['C', 'A', 'B'])

			// An id from another list is refused and changes nothing.
			const otherList = await makeList(tx, { ownerId: owner.id })
			const foreign = await makeCategory(tx, otherList.id, 'Z')
			expect(
				await reorderCategoriesImpl({ userId: owner.id, input: { listId: list.id, categoryIds: [foreign.id, b.id] }, dbx: tx })
			).toEqual({
				kind: 'error',
				reason: 'not-found',
			})
			expect((await categoriesOf(tx, list.id)).map(x => x.name)).toEqual(['C', 'A', 'B'])
		})
	})

	it('keeps the items and groups of a deleted category, with no category', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const clothes = await makeCategory(tx, list.id, 'Clothes')
			const item = await makeItem(tx, { listId: list.id, categoryId: clothes.id })
			const group = await makeGroup(tx, list.id, clothes.id)

			expect((await deleteCategoryImpl({ userId: owner.id, input: { categoryId: clothes.id }, dbx: tx })).kind).toBe('ok')

			expect((await itemRow(tx, item.id)).categoryId).toBeNull()
			const [groupAfter] = await tx.select().from(itemGroups).where(eq(itemGroups.id, group.id))
			expect(groupAfter.categoryId).toBeNull()
		})
	})
})

describe('putting rows in a category', () => {
	it('sets and clears the category of items and of a group', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const clothes = await makeCategory(tx, list.id, 'Clothes')
			const a = await makeItem(tx, { listId: list.id })
			const b = await makeItem(tx, { listId: list.id })
			const group = await makeGroup(tx, list.id)

			const set = await assignCategoryImpl({
				userId: owner.id,
				input: { categoryId: clothes.id, itemIds: [a.id, b.id], groupIds: [group.id] },
				dbx: tx,
			})
			expect(set.kind).toBe('ok')
			expect((await itemRow(tx, a.id)).categoryId).toBe(clothes.id)
			expect((await itemRow(tx, b.id)).categoryId).toBe(clothes.id)
			const editing = await getListForEditingImpl({ userId: owner.id, listId: String(list.id), dbx: tx })
			if (editing.kind !== 'ok') throw new Error('expected the list')
			expect(editing.list.groups.find(g => g.id === group.id)?.categoryId).toBe(clothes.id)

			const cleared = await assignCategoryImpl({ userId: owner.id, input: { categoryId: null, itemIds: [a.id], groupIds: [] }, dbx: tx })
			expect(cleared.kind).toBe('ok')
			expect((await itemRow(tx, a.id)).categoryId).toBeNull()
		})
	})

	it('refuses a category from another list, rows from two lists, and someone who cannot edit', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const stranger = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const other = await makeList(tx, { ownerId: owner.id })
			const here = await makeCategory(tx, list.id, 'Clothes')
			const there = await makeCategory(tx, other.id, 'Clothes')
			const item = await makeItem(tx, { listId: list.id })
			const otherItem = await makeItem(tx, { listId: other.id })

			expect(
				await assignCategoryImpl({ userId: owner.id, input: { categoryId: there.id, itemIds: [item.id], groupIds: [] }, dbx: tx })
			).toEqual({ kind: 'error', reason: 'not-found' })
			expect(
				await assignCategoryImpl({
					userId: owner.id,
					input: { categoryId: here.id, itemIds: [item.id, otherItem.id], groupIds: [] },
					dbx: tx,
				})
			).toEqual({ kind: 'error', reason: 'mixed-lists' })
			expect(
				await assignCategoryImpl({ userId: stranger.id, input: { categoryId: here.id, itemIds: [item.id], groupIds: [] }, dbx: tx })
			).toEqual({ kind: 'error', reason: 'not-authorized' })
			expect((await itemRow(tx, item.id)).categoryId).toBeNull()
		})
	})

	it('takes a category from the item form on create and on edit, and only one of the list', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const other = await makeList(tx, { ownerId: owner.id })
			const clothes = await makeCategory(tx, list.id, 'Clothes')
			const foreign = await makeCategory(tx, other.id, 'Toys')

			const created = await createItemImpl({
				db: tx,
				actor: { id: owner.id },
				input: { listId: list.id, title: 'Jacket', categoryId: clothes.id },
			})
			if (created.kind !== 'ok') throw new Error('expected the item')
			expect(created.item.categoryId).toBe(clothes.id)

			// A category of another list is ignored on create, like a foreign group.
			const stray = await createItemImpl({
				db: tx,
				actor: { id: owner.id },
				input: { listId: list.id, title: 'Hat', categoryId: foreign.id },
			})
			if (stray.kind !== 'ok') throw new Error('expected the item')
			expect(stray.item.categoryId).toBeNull()

			// On edit it is refused, and null clears.
			expect(await updateItemImpl({ db: tx, actor: { id: owner.id }, input: { itemId: created.item.id, categoryId: foreign.id } })).toEqual(
				{
					kind: 'error',
					reason: 'not-found',
				}
			)
			const cleared = await updateItemImpl({ db: tx, actor: { id: owner.id }, input: { itemId: created.item.id, categoryId: null } })
			if (cleared.kind !== 'ok') throw new Error('expected the item')
			expect(cleared.item.categoryId).toBeNull()

			// An edit that does not mention the category leaves it alone.
			await assignCategoryImpl({ userId: owner.id, input: { categoryId: clothes.id, itemIds: [created.item.id], groupIds: [] }, dbx: tx })
			const retitled = await updateItemImpl({ db: tx, actor: { id: owner.id }, input: { itemId: created.item.id, title: 'Puffer jacket' } })
			if (retitled.kind !== 'ok') throw new Error('expected the item')
			expect(retitled.item.categoryId).toBe(clothes.id)
		})
	})
})

describe('carrying a category to another list by name', () => {
	it('lands a moved item in the category of the same name, ignoring case', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const source = await makeList(tx, { ownerId: owner.id })
			const target = await makeList(tx, { ownerId: owner.id })
			const clothes = await makeCategory(tx, source.id, 'Clothes')
			const targetClothes = await makeCategory(tx, target.id, 'clothes')
			const item = await makeItem(tx, { listId: source.id, categoryId: clothes.id })

			const moved = await moveItemsToListImpl({
				userId: owner.id,
				input: { itemIds: [item.id], targetListId: target.id, purgeComments: false },
				dbx: tx,
			})
			expect(moved.kind).toBe('ok')

			expect((await itemRow(tx, item.id)).categoryId).toBe(targetClothes.id)
			expect(await categoriesOf(tx, target.id)).toHaveLength(1)
			await expectNoStrayCategories(tx, target.id)
		})
	})

	it('creates the category at the end of the target when it is missing', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const source = await makeList(tx, { ownerId: owner.id })
			const target = await makeList(tx, { ownerId: owner.id })
			const clothes = await makeCategory(tx, source.id, 'Clothes')
			await makeCategory(tx, target.id, 'Books', 0)
			const a = await makeItem(tx, { listId: source.id, categoryId: clothes.id })
			const b = await makeItem(tx, { listId: source.id, categoryId: clothes.id })
			const plain = await makeItem(tx, { listId: source.id })

			await moveItemsToListImpl({
				userId: owner.id,
				input: { itemIds: [a.id, b.id, plain.id], targetListId: target.id, purgeComments: false },
				dbx: tx,
			})

			const targetCategories = await categoriesOf(tx, target.id)
			expect(targetCategories.map(c => c.name)).toEqual(['Books', 'Clothes'])
			const created = targetCategories[1]
			expect((await itemRow(tx, a.id)).categoryId).toBe(created.id)
			expect((await itemRow(tx, b.id)).categoryId).toBe(created.id)
			expect((await itemRow(tx, plain.id)).categoryId).toBeNull()
			// The source list keeps its own category.
			expect((await categoriesOf(tx, source.id)).map(c => c.name)).toEqual(['Clothes'])
			await expectNoStrayCategories(tx, target.id)
		})
	})

	it('carries the group category when a grouped item moves on its own', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const source = await makeList(tx, { ownerId: owner.id })
			const target = await makeList(tx, { ownerId: owner.id })
			const toys = await makeCategory(tx, source.id, 'Toys', 0)
			const clothes = await makeCategory(tx, source.id, 'Clothes', 1)
			const group = await makeGroup(tx, source.id, toys.id)
			// The item's own category is Clothes, but it shows under Toys
			// while it is in the group.
			const item = await makeItem(tx, { listId: source.id, groupId: group.id, groupSortOrder: 0, categoryId: clothes.id })

			await moveItemsToListImpl({ userId: owner.id, input: { itemIds: [item.id], targetListId: target.id, purgeComments: false }, dbx: tx })

			const after = await itemRow(tx, item.id)
			expect(after.groupId).toBeNull()
			const targetCategories = await categoriesOf(tx, target.id)
			expect(targetCategories.map(c => c.name)).toEqual(['Toys'])
			expect(after.categoryId).toBe(targetCategories[0].id)
		})
	})

	it('carries a moved group category and its members own categories', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const source = await makeList(tx, { ownerId: owner.id })
			const target = await makeList(tx, { ownerId: owner.id })
			const toys = await makeCategory(tx, source.id, 'Toys', 0)
			const clothes = await makeCategory(tx, source.id, 'Clothes', 1)
			const group = await makeGroup(tx, source.id, toys.id)
			const member = await makeItem(tx, { listId: source.id, groupId: group.id, groupSortOrder: 0, categoryId: clothes.id })

			const moved = await moveGroupToListImpl({
				userId: owner.id,
				input: { groupId: group.id, targetListId: target.id, purgeComments: false },
				dbx: tx,
			})
			expect(moved.kind).toBe('ok')

			const byName = new Map((await categoriesOf(tx, target.id)).map(c => [c.name, c.id]))
			expect([...byName.keys()].sort()).toEqual(['Clothes', 'Toys'])
			const [groupAfter] = await tx.select().from(itemGroups).where(eq(itemGroups.id, group.id))
			expect(groupAfter.listId).toBe(target.id)
			expect(groupAfter.categoryId).toBe(byName.get('Toys'))
			expect((await itemRow(tx, member.id)).categoryId).toBe(byName.get('Clothes'))
			await expectNoStrayCategories(tx, target.id)
		})
	})

	it('gives a copy the category the source showed under, on the target list', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const viewer = await makeUser(tx)
			const source = await makeList(tx, { ownerId: owner.id })
			const mine = await makeList(tx, { ownerId: viewer.id })
			const clothes = await makeCategory(tx, source.id, 'Clothes')
			const item = await makeItem(tx, { listId: source.id, categoryId: clothes.id })
			const plain = await makeItem(tx, { listId: source.id })

			const copied = await copyItemToListImpl({ userId: viewer.id, input: { itemId: item.id, targetListId: mine.id }, dbx: tx })
			if (copied.kind !== 'ok') throw new Error('expected the copy')
			const mineCategories = await categoriesOf(tx, mine.id)
			expect(mineCategories.map(c => c.name)).toEqual(['Clothes'])
			expect(copied.item.categoryId).toBe(mineCategories[0].id)
			// The source keeps its own.
			expect((await itemRow(tx, item.id)).categoryId).toBe(clothes.id)

			// An item with no category copies with none and creates nothing.
			const copiedPlain = await copyItemToListImpl({ userId: viewer.id, input: { itemId: plain.id, targetListId: mine.id }, dbx: tx })
			if (copiedPlain.kind !== 'ok') throw new Error('expected the copy')
			expect(copiedPlain.item.categoryId).toBeNull()
			expect(await categoriesOf(tx, mine.id)).toHaveLength(1)
		})
	})
})

describe('lists that have no categories', () => {
	it('refuses to copy an item onto a todo list, and makes no category there', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const source = await makeList(tx, { ownerId: owner.id })
			const todos = await makeList(tx, { ownerId: owner.id, type: 'todos' })
			const clothes = await makeCategory(tx, source.id, 'Clothes')
			const item = await makeItem(tx, { listId: source.id, categoryId: clothes.id })

			// The copy is refused outright: a todo list takes no gift items.
			const copied = await copyItemToListImpl({ userId: owner.id, input: { itemId: item.id, targetListId: todos.id }, dbx: tx })
			expect(copied).toEqual({ kind: 'error', reason: 'todo-list-rejects-items' })
			expect(await categoriesOf(tx, todos.id)).toHaveLength(0)
			expect(await tx.select({ id: items.id }).from(items).where(eq(items.listId, todos.id))).toHaveLength(0)
		})
	})
})

describe('the gifter view', () => {
	it('is sent only the categories that hold an item, with the group category kept', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const toys = await makeCategory(tx, list.id, 'Toys', 0)
			const clothes = await makeCategory(tx, list.id, 'Clothes', 1)
			await makeCategory(tx, list.id, 'Empty', 2)
			await makeItem(tx, { listId: list.id, categoryId: clothes.id })
			const group = await makeGroup(tx, list.id, toys.id)
			await makeItem(tx, { listId: list.id, groupId: group.id, groupSortOrder: 0 })

			const header = await getListHeaderImpl({ userId: gifter.id, listId: String(list.id), dbx: tx })
			if (header?.kind !== 'ok') throw new Error('expected the header')
			// In the owner's order, and without the empty one.
			expect(header.list.categories.map(c => c.name)).toEqual(['Toys', 'Clothes'])
			expect(header.list.groups.find(g => g.id === group.id)?.categoryId).toBe(toys.id)

			const viewing = await getListForViewingImpl({ userId: gifter.id, listId: String(list.id), dbx: tx })
			if (viewing?.kind !== 'ok') throw new Error('expected the list')
			expect(viewing.list.categories.map(c => c.name)).toEqual(['Toys', 'Clothes'])
		})
	})

	it('sends no categories for a list that has none in use', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const gifter = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			await makeCategory(tx, list.id, 'Clothes')
			await makeItem(tx, { listId: list.id })

			const header = await getListHeaderImpl({ userId: gifter.id, listId: String(list.id), dbx: tx })
			if (header?.kind !== 'ok') throw new Error('expected the header')
			expect(header.list.categories).toEqual([])
		})
	})

	it('never sends a restricted viewer a category whose items are all hidden from them', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const restricted = await makeUser(tx)
			const outsider = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			await makeUserRelationship(tx, { ownerUserId: owner.id, viewerUserId: restricted.id, accessLevel: 'restricted' })
			const secret = await makeCategory(tx, list.id, 'Surprise party', 0)
			const clothes = await makeCategory(tx, list.id, 'Clothes', 1)
			// Fully claimed by someone else: hidden from a restricted viewer.
			const hiddenItem = await makeItem(tx, { listId: list.id, categoryId: secret.id })
			await makeGiftedItem(tx, { itemId: hiddenItem.id, gifterId: outsider.id })
			const hiddenGroup = await makeGroup(tx, list.id, secret.id)
			const groupedHidden = await makeItem(tx, { listId: list.id, groupId: hiddenGroup.id, groupSortOrder: 0 })
			await makeGiftedItem(tx, { itemId: groupedHidden.id, gifterId: outsider.id })
			await makeItem(tx, { listId: list.id, categoryId: clothes.id })

			const forRestricted = await getListHeaderImpl({ userId: restricted.id, listId: String(list.id), dbx: tx })
			if (forRestricted?.kind !== 'ok') throw new Error('expected the header')
			expect(forRestricted.list.categories.map(c => c.name)).toEqual(['Clothes'])
			// The hidden group's category id is not sent either.
			expect(forRestricted.list.groups.find(g => g.id === hiddenGroup.id)?.categoryId).toBeNull()

			// Someone with full view sees both.
			const forOutsider = await getListHeaderImpl({ userId: outsider.id, listId: String(list.id), dbx: tx })
			if (forOutsider?.kind !== 'ok') throw new Error('expected the header')
			expect(forOutsider.list.categories.map(c => c.name)).toEqual(['Surprise party', 'Clothes'])
		})
	})
})

describe('names from the other lists', () => {
	it('offers the names used on the caller own other lists, minus the ones this list has', async () => {
		await withRollback(async tx => {
			const owner = await makeUser(tx)
			const editor = await makeUser(tx)
			const list = await makeList(tx, { ownerId: owner.id })
			const birthday = await makeList(tx, { ownerId: owner.id })
			const archived = await makeList(tx, { ownerId: owner.id, isActive: false })
			const editorsOwn = await makeList(tx, { ownerId: editor.id })
			await makeListEditor(tx, { listId: list.id, userId: editor.id, ownerId: owner.id })
			await makeCategory(tx, list.id, 'Clothes')
			await makeCategory(tx, birthday.id, 'clothes', 0)
			await makeCategory(tx, birthday.id, 'Books', 1)
			await makeCategory(tx, archived.id, 'Old', 0)
			await makeCategory(tx, editorsOwn.id, 'Tools', 0)

			// The owner sees Books: Clothes is already here, and an archived
			// list is not read.
			expect(await getCategoryNameSuggestionsImpl({ userId: owner.id, input: { listId: list.id }, dbx: tx })).toEqual({
				kind: 'ok',
				names: ['Books'],
			})
			// An editor is offered their own names, never the owner's other lists.
			expect(await getCategoryNameSuggestionsImpl({ userId: editor.id, input: { listId: list.id }, dbx: tx })).toEqual({
				kind: 'ok',
				names: ['Tools'],
			})
		})
	})
})
