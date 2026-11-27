// Server-only implementations for item categories. Lives apart from
// `categories.ts` so the static import chain into `db`, drizzle ops and the
// permissions helper stays out of the client bundle. The rules are in
// docs/logic.md "Item categories".

import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm'
import { z } from 'zod'

import type { SchemaDatabase } from '@/db'
import { db } from '@/db'
import { itemCategories, itemGroups, items, lists } from '@/db/schema'
import type { CategorySummary } from '@/lib/item-categories'
import { visibleItemsWhere } from '@/lib/item-visibility'
import { notifyListEvent } from '@/lib/list-event-bus'
import { canEditListAsAnyone } from '@/lib/permissions'
import { LIMITS } from '@/lib/validation/limits'

// ===============================
// Public types
// ===============================

type EditReason = 'not-found' | 'not-authorized'

export type CreateCategoryResult = { kind: 'ok'; category: CategorySummary } | { kind: 'error'; reason: EditReason | 'name-taken' }

export type UpdateCategoryResult = { kind: 'ok' } | { kind: 'error'; reason: EditReason | 'name-taken' }

export type ReorderCategoriesResult = { kind: 'ok' } | { kind: 'error'; reason: EditReason }

export type DeleteCategoryResult = { kind: 'ok' } | { kind: 'error'; reason: EditReason }

export type AssignCategoryResult = { kind: 'ok' } | { kind: 'error'; reason: EditReason | 'mixed-lists' }

export type CategoryNameSuggestionsResult = { kind: 'ok'; names: Array<string> } | { kind: 'error'; reason: EditReason }

// ===============================
// Input schemas
// ===============================

const categoryName = z.string().trim().min(1).max(LIMITS.CATEGORY_NAME)

export const CreateCategoryInputSchema = z.object({
	listId: z.number().int().positive(),
	name: categoryName,
})

export const UpdateCategoryInputSchema = z.object({
	categoryId: z.number().int().positive(),
	name: categoryName,
})

export const ReorderCategoriesInputSchema = z.object({
	listId: z.number().int().positive(),
	categoryIds: z.array(z.number().int().positive()).min(1).max(200),
})

export const DeleteCategoryInputSchema = z.object({
	categoryId: z.number().int().positive(),
})

export const AssignCategoryInputSchema = z
	.object({
		// null clears the category.
		categoryId: z.number().int().positive().nullable(),
		itemIds: z.array(z.number().int().positive()).max(200).default([]),
		groupIds: z.array(z.number().int().positive()).max(200).default([]),
	})
	.refine(d => d.itemIds.length + d.groupIds.length > 0, { message: 'At least one item or group is required' })

export const CategoryNameSuggestionsInputSchema = z.object({
	listId: z.number().int().positive(),
})

// ===============================
// Helpers
// ===============================

// Anyone who can edit the list can manage its categories, the same as its
// groups. Todo lists use a different row table and have no categories, so
// they read as not-found here.
async function loadListForCategories(
	userId: string,
	listId: number,
	dbx: SchemaDatabase
): Promise<{ ok: true } | { ok: false; reason: EditReason }> {
	const list = await dbx.query.lists.findFirst({
		where: eq(lists.id, listId),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true, type: true },
	})
	if (!list || list.type === 'todos') return { ok: false, reason: 'not-found' }
	const edit = await canEditListAsAnyone(userId, list, dbx)
	if (!edit.ok) return { ok: false, reason: 'not-authorized' }
	return { ok: true }
}

async function nameIsTaken(dbx: SchemaDatabase, listId: number, name: string, exceptId?: number): Promise<boolean> {
	const rows = await dbx
		.select({ id: itemCategories.id })
		.from(itemCategories)
		.where(
			and(
				eq(itemCategories.listId, listId),
				sql`lower(${itemCategories.name}) = lower(${name})`,
				exceptId === undefined ? undefined : ne(itemCategories.id, exceptId)
			)
		)
		.limit(1)
	return rows.length > 0
}

export async function loadCategoriesForList(dbx: SchemaDatabase, listId: number): Promise<Array<CategorySummary>> {
	return dbx
		.select({ id: itemCategories.id, name: itemCategories.name, sortOrder: itemCategories.sortOrder })
		.from(itemCategories)
		.where(eq(itemCategories.listId, listId))
		.orderBy(asc(itemCategories.sortOrder), asc(itemCategories.id))
}

// ===============================
// Impls
// ===============================

export async function createCategoryImpl(args: {
	userId: string
	input: z.infer<typeof CreateCategoryInputSchema>
	dbx?: SchemaDatabase
}): Promise<CreateCategoryResult> {
	const { userId, input: data, dbx = db } = args
	const perm = await loadListForCategories(userId, data.listId, dbx)
	if (!perm.ok) return { kind: 'error', reason: perm.reason }
	if (await nameIsTaken(dbx, data.listId, data.name)) return { kind: 'error', reason: 'name-taken' }

	const [{ next }] = await dbx
		.select({ next: sql<number>`coalesce(max(${itemCategories.sortOrder}) + 1, 0)` })
		.from(itemCategories)
		.where(eq(itemCategories.listId, data.listId))
	// The unique index is the real guard; the check above only gives the
	// common case a clean answer. A concurrent create of the same name
	// inserts nothing and is reported the same way.
	const inserted = await dbx
		.insert(itemCategories)
		.values({ listId: data.listId, name: data.name, sortOrder: Number(next) })
		.onConflictDoNothing()
		.returning({ id: itemCategories.id, name: itemCategories.name, sortOrder: itemCategories.sortOrder })
	if (inserted.length === 0) return { kind: 'error', reason: 'name-taken' }

	notifyListEvent({ kind: 'item', listId: data.listId, itemId: -1 })
	return { kind: 'ok', category: inserted[0] }
}

export async function updateCategoryImpl(args: {
	userId: string
	input: z.infer<typeof UpdateCategoryInputSchema>
	dbx?: SchemaDatabase
}): Promise<UpdateCategoryResult> {
	const { userId, input: data, dbx = db } = args
	const category = await dbx.query.itemCategories.findFirst({
		where: eq(itemCategories.id, data.categoryId),
		columns: { id: true, listId: true },
	})
	if (!category) return { kind: 'error', reason: 'not-found' }
	const perm = await loadListForCategories(userId, category.listId, dbx)
	if (!perm.ok) return { kind: 'error', reason: perm.reason }
	if (await nameIsTaken(dbx, category.listId, data.name, category.id)) return { kind: 'error', reason: 'name-taken' }

	await dbx.update(itemCategories).set({ name: data.name }).where(eq(itemCategories.id, category.id))
	notifyListEvent({ kind: 'item', listId: category.listId, itemId: -1 })
	return { kind: 'ok' }
}

// Sets the order everyone sees. Ids are written in the order sent; any
// category of the list that was left out keeps its relative place after them.
export async function reorderCategoriesImpl(args: {
	userId: string
	input: z.infer<typeof ReorderCategoriesInputSchema>
	dbx?: SchemaDatabase
}): Promise<ReorderCategoriesResult> {
	const { userId, input: data, dbx = db } = args
	const perm = await loadListForCategories(userId, data.listId, dbx)
	if (!perm.ok) return { kind: 'error', reason: perm.reason }

	const existing = await loadCategoriesForList(dbx, data.listId)
	const known = new Set(existing.map(c => c.id))
	const sent = [...new Set(data.categoryIds)]
	if (sent.some(id => !known.has(id))) return { kind: 'error', reason: 'not-found' }
	const sentSet = new Set(sent)
	const order = [...sent, ...existing.filter(c => !sentSet.has(c.id)).map(c => c.id)]

	await dbx.transaction(async tx => {
		for (let i = 0; i < order.length; i++) {
			await tx.update(itemCategories).set({ sortOrder: i }).where(eq(itemCategories.id, order[i]))
		}
	})
	notifyListEvent({ kind: 'item', listId: data.listId, itemId: -1 })
	return { kind: 'ok' }
}

// Deleting a category keeps its items and groups: the foreign keys set
// their categoryId to null.
export async function deleteCategoryImpl(args: {
	userId: string
	input: z.infer<typeof DeleteCategoryInputSchema>
	dbx?: SchemaDatabase
}): Promise<DeleteCategoryResult> {
	const { userId, input: data, dbx = db } = args
	const category = await dbx.query.itemCategories.findFirst({
		where: eq(itemCategories.id, data.categoryId),
		columns: { id: true, listId: true },
	})
	if (!category) return { kind: 'error', reason: 'not-found' }
	const perm = await loadListForCategories(userId, category.listId, dbx)
	if (!perm.ok) return { kind: 'error', reason: perm.reason }

	await dbx.delete(itemCategories).where(eq(itemCategories.id, category.id))
	notifyListEvent({ kind: 'item', listId: category.listId, itemId: -1 })
	return { kind: 'ok' }
}

// Puts items and groups in a category of their own list, or clears it.
// Everything sent must be on one list, and so must the category.
export async function assignCategoryImpl(args: {
	userId: string
	input: z.infer<typeof AssignCategoryInputSchema>
	dbx?: SchemaDatabase
}): Promise<AssignCategoryResult> {
	const { userId, input: data, dbx = db } = args
	const itemIds = [...new Set(data.itemIds)]
	const groupIds = [...new Set(data.groupIds)]

	// Pending-deletion items are not-found to the recipient, as for every
	// other recipient-side mutation.
	const [itemRows, groupRows] = await Promise.all([
		itemIds.length > 0
			? dbx.query.items.findMany({
					where: and(inArray(items.id, itemIds), visibleItemsWhere('editable')),
					columns: { id: true, listId: true },
				})
			: [],
		groupIds.length > 0
			? dbx.query.itemGroups.findMany({ where: inArray(itemGroups.id, groupIds), columns: { id: true, listId: true } })
			: [],
	])
	if (itemRows.length !== itemIds.length || groupRows.length !== groupIds.length) return { kind: 'error', reason: 'not-found' }

	const listIds = new Set([...itemRows, ...groupRows].map(r => r.listId))
	if (listIds.size !== 1) return { kind: 'error', reason: 'mixed-lists' }
	const [listId] = listIds

	if (data.categoryId !== null) {
		const category = await dbx.query.itemCategories.findFirst({
			where: and(eq(itemCategories.id, data.categoryId), eq(itemCategories.listId, listId)),
			columns: { id: true },
		})
		if (!category) return { kind: 'error', reason: 'not-found' }
	}

	const perm = await loadListForCategories(userId, listId, dbx)
	if (!perm.ok) return { kind: 'error', reason: perm.reason }

	if (itemIds.length > 0) await dbx.update(items).set({ categoryId: data.categoryId }).where(inArray(items.id, itemIds))
	if (groupIds.length > 0) await dbx.update(itemGroups).set({ categoryId: data.categoryId }).where(inArray(itemGroups.id, groupIds))

	notifyListEvent({ kind: 'item', listId, itemId: -1 })
	return { kind: 'ok' }
}

// Names the caller has used on the other lists they own, minus the ones
// this list already has. Offered in the Categories dialog so a second list
// gets the same categories with a tap each. Only the caller's own lists are
// read, so an editor is never shown names from an owner's other lists.
export async function getCategoryNameSuggestionsImpl(args: {
	userId: string
	input: z.infer<typeof CategoryNameSuggestionsInputSchema>
	dbx?: SchemaDatabase
}): Promise<CategoryNameSuggestionsResult> {
	const { userId, input: data, dbx = db } = args
	const perm = await loadListForCategories(userId, data.listId, dbx)
	if (!perm.ok) return { kind: 'error', reason: perm.reason }

	const [mine, here] = await Promise.all([
		dbx
			.select({ name: itemCategories.name })
			.from(itemCategories)
			.innerJoin(lists, eq(lists.id, itemCategories.listId))
			.where(and(eq(lists.ownerId, userId), eq(lists.isActive, true), ne(lists.id, data.listId)))
			.orderBy(asc(itemCategories.name)),
		loadCategoriesForList(dbx, data.listId),
	])
	const taken = new Set(here.map(c => c.name.toLowerCase()))
	const names: Array<string> = []
	for (const row of mine) {
		const key = row.name.toLowerCase()
		if (taken.has(key)) continue
		taken.add(key)
		names.push(row.name)
	}
	return { kind: 'ok', names: names.slice(0, 30) }
}
