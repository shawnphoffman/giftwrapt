// Keeps a row's category on its own list when the row moves or is copied to
// another list. A category belongs to one list, so the category is matched
// on the destination by name (ignoring case) and created there when missing.
// See docs/logic.md "Item categories".
//
// Every path that changes `items.listId` or `item_groups.listId`, or inserts
// a copy of an item on another list, goes through this file. Server-only.

import { and, eq, inArray, ne, sql } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { itemCategories, itemGroups, items } from '@/db/schema'

// This list's category with the given name, created at the end of the order
// if the list has none. The unique index on (list, lower(name)) settles a
// race between two callers: the loser's insert does nothing and the re-read
// finds the winner's row.
export async function findOrCreateCategoryByName(dbx: SchemaDatabase, listId: number, name: string): Promise<number> {
	const byName = and(eq(itemCategories.listId, listId), sql`lower(${itemCategories.name}) = lower(${name})`)
	const existing = await dbx.select({ id: itemCategories.id }).from(itemCategories).where(byName).limit(1)
	if (existing.length > 0) return existing[0].id

	const [{ next }] = await dbx
		.select({ next: sql<number>`coalesce(max(${itemCategories.sortOrder}) + 1, 0)` })
		.from(itemCategories)
		.where(eq(itemCategories.listId, listId))
	await dbx
		.insert(itemCategories)
		.values({ listId, name, sortOrder: Number(next) })
		.onConflictDoNothing()
	const [row] = await dbx.select({ id: itemCategories.id }).from(itemCategories).where(byName).limit(1)
	return row.id
}

// The category an item shows under: its group's while it is in a group
// (even when the group has none), otherwise its own.
export async function loadEffectiveCategoryIds(dbx: SchemaDatabase, itemIds: ReadonlyArray<number>): Promise<Map<number, number | null>> {
	const out = new Map<number, number | null>()
	if (itemIds.length === 0) return out
	const rows = await dbx
		.select({ id: items.id, groupId: items.groupId, own: items.categoryId, groupCategoryId: itemGroups.categoryId })
		.from(items)
		.leftJoin(itemGroups, eq(itemGroups.id, items.groupId))
		.where(inArray(items.id, [...itemIds]))
	for (const r of rows) out.set(r.id, r.groupId === null ? r.own : r.groupCategoryId)
	return out
}

// The id to store on a copy made on `targetListId`, for a category that
// lives on any list. Null stays null.
export async function resolveCategoryForList(
	dbx: SchemaDatabase,
	args: { categoryId: number | null; targetListId: number }
): Promise<number | null> {
	if (args.categoryId === null) return null
	const rows = await dbx
		.select({ listId: itemCategories.listId, name: itemCategories.name })
		.from(itemCategories)
		.where(eq(itemCategories.id, args.categoryId))
		.limit(1)
	if (rows.length === 0) return null
	const category = rows[0]
	if (category.listId === args.targetListId) return args.categoryId
	return findOrCreateCategoryByName(dbx, args.targetListId, category.name)
}

// Run inside the transaction that moved rows onto `listId`, after the move.
// Any item or group on the list that still points at another list's
// category is repointed to this list's category of the same name.
export async function carryCategoriesToList(dbx: SchemaDatabase, listId: number): Promise<void> {
	const [strayOnItems, strayOnGroups] = await Promise.all([
		dbx
			.selectDistinct({ id: itemCategories.id, name: itemCategories.name })
			.from(items)
			.innerJoin(itemCategories, eq(itemCategories.id, items.categoryId))
			.where(and(eq(items.listId, listId), ne(itemCategories.listId, listId))),
		dbx
			.selectDistinct({ id: itemCategories.id, name: itemCategories.name })
			.from(itemGroups)
			.innerJoin(itemCategories, eq(itemCategories.id, itemGroups.categoryId))
			.where(and(eq(itemGroups.listId, listId), ne(itemCategories.listId, listId))),
	])
	const stray = new Map<number, string>()
	for (const c of [...strayOnItems, ...strayOnGroups]) stray.set(c.id, c.name)

	for (const [foreignId, name] of stray) {
		const localId = await findOrCreateCategoryByName(dbx, listId, name)
		await dbx
			.update(items)
			.set({ categoryId: localId })
			.where(and(eq(items.listId, listId), eq(items.categoryId, foreignId)))
		await dbx
			.update(itemGroups)
			.set({ categoryId: localId })
			.where(and(eq(itemGroups.listId, listId), eq(itemGroups.categoryId, foreignId)))
	}
}
