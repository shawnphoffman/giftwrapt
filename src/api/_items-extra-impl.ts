// Server-only item implementations that aren't in `_items-impl.ts`
// (which is reserved for the original create/update/delete trio with
// the storage-mirror chain). Same isolation rationale as
// `_items-impl.ts`: keeps `db`, `cleanup`, drizzle ops, and friends out
// of the client bundle by ensuring `items.ts` only references these
// from inside server-fn handler / inputValidator bodies.

import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'

import { db, type SchemaDatabase } from '@/db'
import { giftedItems, itemComments, itemGroups, items, lists, users } from '@/db/schema'
import { availabilityEnumValues, type ListType, type Priority, priorityEnumValues } from '@/db/schema/enums'
import type { GiftedItem } from '@/db/schema/gifts'
import type { Item } from '@/db/schema/items'
import { isCrossTypeMoveDestructive, SPOILER_PROTECTED_TYPES } from '@/lib/list-type-moves'
import { canEditList, canViewList, getViewerAccessLevelForList } from '@/lib/permissions'
import { filterItemsForRestricted } from '@/lib/restricted-filter'
import { cleanupImageUrls } from '@/lib/storage/cleanup'
import { getVendorFromUrl } from '@/lib/urls'
import { notifyListEvent } from '@/routes/api/sse/list.$listId'

// Re-exported for callers that already import from this module (mirrors
// the previous local definition). The predicate itself lives in
// src/lib/list-type-moves.ts so the intelligence merge-lists apply
// branch can import it without pulling this file's SSE / storage /
// restricted-filter imports.
export { isCrossTypeMoveDestructive, SPOILER_PROTECTED_TYPES }

// ===============================
// Public types
// ===============================

export type GiftOnItem = Pick<
	GiftedItem,
	'id' | 'itemId' | 'gifterId' | 'quantity' | 'notes' | 'totalCost' | 'additionalGifterIds' | 'createdAt'
> & {
	gifter: {
		id: string
		name: string | null
		email: string
		image: string | null
	}
}

export type ItemWithGifts = Item & {
	gifts: Array<GiftOnItem>
	commentCount: number
}

export type ItemForEditing = Item & { commentCount: number }

export type SortOption = 'priority-asc' | 'priority-desc' | 'date-asc' | 'date-desc'

export type CopyItemResult = { kind: 'ok'; item: Item } | { kind: 'error'; reason: 'not-found' | 'source-not-visible' | 'not-authorized' }

export type ArchiveItemResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export type SetItemAvailabilityResult = { kind: 'ok'; item: Item } | { kind: 'error'; reason: 'not-found' | 'not-visible' }

export type MoveItemsResult =
	| { kind: 'ok'; moved: number; claimsCleared: number; commentsDeleted: number }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' | 'todo-items-cannot-cross-types' }

export type ArchiveItemsResult = { kind: 'ok'; updated: number } | { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export type ArchiveListPurchasesResult = { kind: 'ok'; updated: number } | { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export type DeleteItemsResult = { kind: 'ok'; deleted: number } | { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export type SetItemsPriorityResult = { kind: 'ok'; updated: number } | { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export type ReorderItemsResult = { kind: 'ok'; updated: number } | { kind: 'error'; reason: 'not-found' | 'not-authorized' | 'mixed-lists' }

export type ReorderEntriesResult =
	| { kind: 'ok'; updatedItems: number; updatedGroups: number }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' | 'mixed-lists' }

export type SetGroupsPriorityResult =
	| { kind: 'ok'; updated: number }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' | 'mixed-lists' }

export type DeleteGroupsResult =
	| { kind: 'ok'; deletedGroups: number; deletedItems: number }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' | 'mixed-lists' }

export type GetItemsForListViewResult =
	| { kind: 'ok'; items: Array<ItemWithGifts> }
	| { kind: 'error'; reason: 'not-found' | 'not-visible' | 'is-owner' }

export type GetItemsForListEditResult =
	| { kind: 'ok'; items: Array<ItemForEditing> }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' }

// ===============================
// Input schemas
// ===============================

export const CopyItemInputSchema = z.object({
	itemId: z.number().int().positive(),
	targetListId: z.number().int().positive(),
})

export const ArchiveItemInputSchema = z.object({
	itemId: z.number().int().positive(),
	archived: z.boolean(),
})

export const SetItemAvailabilityInputSchema = z.object({
	itemId: z.number().int().positive(),
	availability: z.enum(availabilityEnumValues),
})

const BulkIdsSchema = z.array(z.number().int().positive()).min(1).max(500)

export const MoveItemsInputSchema = z.object({
	itemIds: BulkIdsSchema,
	targetListId: z.number().int().positive(),
	purgeComments: z.boolean().default(false),
})

export const ArchiveItemsInputSchema = z.object({
	itemIds: BulkIdsSchema,
	archived: z.boolean(),
})

export const ArchiveListPurchasesInputSchema = z.object({
	listId: z.number().int().positive(),
})

export const DeleteItemsInputSchema = z.object({
	itemIds: BulkIdsSchema,
})

export const SetItemsPriorityInputSchema = z.object({
	itemIds: BulkIdsSchema,
	priority: z.enum(priorityEnumValues),
})

export const ReorderItemsInputSchema = z.object({
	listId: z.number().int().positive(),
	updates: z
		.array(
			z.object({
				itemId: z.number().int().positive(),
				priority: z.enum(priorityEnumValues),
				sortOrder: z.number().int().min(0),
			})
		)
		.min(1)
		.max(500),
})

export const ReorderEntriesInputSchema = z.object({
	listId: z.number().int().positive(),
	items: z
		.array(
			z.object({
				itemId: z.number().int().positive(),
				priority: z.enum(priorityEnumValues),
				sortOrder: z.number().int().min(0),
			})
		)
		.max(500),
	groups: z
		.array(
			z.object({
				groupId: z.number().int().positive(),
				priority: z.enum(priorityEnumValues),
				sortOrder: z.number().int().min(0),
			})
		)
		.max(500),
})

export const SetGroupsPriorityInputSchema = z.object({
	groupIds: z.array(z.number().int().positive()).min(1).max(100),
	priority: z.enum(priorityEnumValues),
})

export const DeleteGroupsInputSchema = z.object({
	groupIds: z.array(z.number().int().positive()).min(1).max(100),
})

// ===============================
// Helpers
// ===============================

type ListForPermCheck = { id: number; ownerId: string; subjectDependentId: string | null; isPrivate: boolean; isActive: boolean }

async function assertCanEditItems(
	userId: string,
	list: ListForPermCheck,
	dbx: SchemaDatabase = db
): Promise<{ ok: true } | { ok: false; reason: 'not-authorized' }> {
	if (list.ownerId === userId) return { ok: true }
	const edit = await canEditList(userId, list, dbx)
	if (!edit.ok) return { ok: false, reason: 'not-authorized' }
	return { ok: true }
}

type ItemRow = { id: number; listId: number }

async function loadAndAuthorizeItems(
	userId: string,
	itemIds: ReadonlyArray<number>
): Promise<
	| { ok: true; rows: Array<ItemRow>; lists: Map<number, ListForPermCheck & { type: ListType }> }
	| { ok: false; reason: 'not-found' | 'not-authorized' }
> {
	// Pending-deletion items are excluded so the recipient's bulk
	// mutations (organize / move / etc.) treat them as not-found, matching
	// the per-item 404 contract.
	const rows = await db.query.items.findMany({
		where: and(inArray(items.id, [...itemIds]), isNull(items.pendingDeletionAt)),
		columns: { id: true, listId: true },
	})
	if (rows.length !== itemIds.length) return { ok: false, reason: 'not-found' }

	const listIds = [...new Set(rows.map(r => r.listId))]
	const listRows = await db.query.lists.findMany({
		where: inArray(lists.id, listIds),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true, type: true },
	})
	if (listRows.length !== listIds.length) return { ok: false, reason: 'not-found' }

	const map = new Map<number, ListForPermCheck & { type: ListType }>()
	for (const l of listRows) {
		const perm = await assertCanEditItems(userId, l)
		if (!perm.ok) return { ok: false, reason: 'not-authorized' }
		map.set(l.id, l)
	}
	return { ok: true, rows, lists: map }
}

// ===============================
// Impls
// ===============================

export async function copyItemToListImpl(args: { userId: string; input: z.infer<typeof CopyItemInputSchema> }): Promise<CopyItemResult> {
	const { userId, input: data } = args

	// Pending-deletion items are invisible everywhere except the alert UI
	// for the audience with standing on their claims; copy is not allowed.
	const sourceItem = await db.query.items.findFirst({
		where: and(eq(items.id, data.itemId), isNull(items.pendingDeletionAt)),
	})
	if (!sourceItem) return { kind: 'error', reason: 'not-found' }

	const sourceList = await db.query.lists.findFirst({
		where: eq(lists.id, sourceItem.listId),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
	})
	if (!sourceList) return { kind: 'error', reason: 'not-found' }

	const view = await canViewList(userId, sourceList)
	if (!view.ok) return { kind: 'error', reason: 'source-not-visible' }

	const targetList = await db.query.lists.findFirst({
		where: eq(lists.id, data.targetListId),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
	})
	if (!targetList) return { kind: 'error', reason: 'not-found' }

	const perm = await assertCanEditItems(userId, targetList)
	if (!perm.ok) return { kind: 'error', reason: 'not-authorized' }

	const vendor = sourceItem.url ? getVendorFromUrl(sourceItem.url) : null

	const [inserted] = await db
		.insert(items)
		.values({
			listId: data.targetListId,
			title: sourceItem.title,
			url: sourceItem.url,
			vendorId: vendor?.id ?? null,
			vendorSource: vendor ? 'rule' : null,
			price: sourceItem.price,
			currency: sourceItem.currency,
			notes: sourceItem.notes,
			priority: sourceItem.priority,
			quantity: sourceItem.quantity,
			imageUrl: sourceItem.imageUrl,
		})
		.returning()

	notifyListEvent({ kind: 'item', listId: data.targetListId, itemId: inserted.id, shape: 'added' })
	return { kind: 'ok', item: inserted }
}

export async function archiveItemImpl(args: {
	userId: string
	input: z.infer<typeof ArchiveItemInputSchema>
	dbx?: SchemaDatabase
}): Promise<ArchiveItemResult> {
	const { userId, input: data, dbx = db } = args

	// Pending-deletion items are not-found from the recipient's perspective.
	const item = await dbx.query.items.findFirst({
		where: and(eq(items.id, data.itemId), isNull(items.pendingDeletionAt)),
		columns: { id: true, listId: true },
	})
	if (!item) return { kind: 'error', reason: 'not-found' }

	const list = await dbx.query.lists.findFirst({
		where: eq(lists.id, item.listId),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
	})
	if (!list) return { kind: 'error', reason: 'not-found' }

	const perm = await assertCanEditItems(userId, list, dbx)
	if (!perm.ok) return { kind: 'error', reason: 'not-authorized' }

	await dbx.update(items).set({ isArchived: data.archived }).where(eq(items.id, data.itemId))
	notifyListEvent({ kind: 'item', listId: item.listId, itemId: data.itemId })
	return { kind: 'ok' }
}

export async function setItemAvailabilityImpl(args: {
	userId: string
	input: z.infer<typeof SetItemAvailabilityInputSchema>
	dbx?: SchemaDatabase
}): Promise<SetItemAvailabilityResult> {
	const { userId, input: data, dbx = db } = args

	const item = await dbx.query.items.findFirst({
		where: and(eq(items.id, data.itemId), isNull(items.pendingDeletionAt)),
		columns: { id: true, listId: true },
	})
	if (!item) return { kind: 'error', reason: 'not-found' }

	const list = await dbx.query.lists.findFirst({
		where: eq(lists.id, item.listId),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
	})
	if (!list) return { kind: 'error', reason: 'not-found' }

	const view = await canViewList(userId, list, dbx)
	if (!view.ok) return { kind: 'error', reason: 'not-visible' }

	const [updated] = await dbx
		.update(items)
		.set({ availability: data.availability, availabilityChangedAt: new Date() })
		.where(eq(items.id, data.itemId))
		.returning()
	notifyListEvent({ kind: 'item', listId: item.listId, itemId: updated.id })
	return { kind: 'ok', item: updated }
}

export async function moveItemsToListImpl(args: { userId: string; input: z.infer<typeof MoveItemsInputSchema> }): Promise<MoveItemsResult> {
	const { userId, input: data } = args

	const loaded = await loadAndAuthorizeItems(userId, data.itemIds)
	if (!loaded.ok) return { kind: 'error', reason: loaded.reason }

	const targetList = await db.query.lists.findFirst({
		where: eq(lists.id, data.targetListId),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true, type: true },
	})
	if (!targetList) return { kind: 'error', reason: 'not-found' }
	const targetPerm = await assertCanEditItems(userId, targetList)
	if (!targetPerm.ok) return { kind: 'error', reason: 'not-authorized' }

	// Todo lists are isolated: an item from a todo list can't move to a
	// non-todo list and vice versa. Within-todos moves are allowed
	// (covered by the source==target check below).
	const anyTodoCrossType = loaded.rows.some(r => {
		const src = loaded.lists.get(r.listId)!
		if (src.type === targetList.type) return false
		return src.type === 'todos' || targetList.type === 'todos'
	})
	if (anyTodoCrossType) return { kind: 'error', reason: 'todo-items-cannot-cross-types' }

	const destructiveItemIds = loaded.rows
		.filter(r => r.listId !== data.targetListId)
		.filter(r => {
			const src = loaded.lists.get(r.listId)!
			return isCrossTypeMoveDestructive(src.type, targetList.type)
		})
		.map(r => r.id)

	const result = await db.transaction(async tx => {
		await tx
			.update(items)
			.set({ listId: data.targetListId, groupId: null, groupSortOrder: null })
			.where(inArray(items.id, [...data.itemIds]))

		let claimsCleared = 0
		if (destructiveItemIds.length > 0) {
			const deleted = await tx.delete(giftedItems).where(inArray(giftedItems.itemId, destructiveItemIds)).returning({ id: giftedItems.id })
			claimsCleared = deleted.length
		}

		let commentsDeleted = 0
		if (data.purgeComments) {
			const deleted = await tx
				.delete(itemComments)
				.where(inArray(itemComments.itemId, [...data.itemIds]))
				.returning({ id: itemComments.id })
			commentsDeleted = deleted.length
		}

		return { kind: 'ok' as const, moved: data.itemIds.length, claimsCleared, commentsDeleted }
	})

	// Per the plan: type-crossing moves clear claims but the two `item`
	// shape events on source/dest are sufficient — cleared claims fall out
	// of the refetched items query without an extra `claim` event.
	for (const row of loaded.rows) {
		if (row.listId !== data.targetListId) {
			notifyListEvent({ kind: 'item', listId: row.listId, itemId: row.id, shape: 'removed' })
		}
		notifyListEvent({ kind: 'item', listId: data.targetListId, itemId: row.id, shape: 'added' })
	}

	return result
}

export async function archiveItemsImpl(args: {
	userId: string
	input: z.infer<typeof ArchiveItemsInputSchema>
}): Promise<ArchiveItemsResult> {
	const { userId, input: data } = args
	const loaded = await loadAndAuthorizeItems(userId, data.itemIds)
	if (!loaded.ok) return { kind: 'error', reason: loaded.reason }

	await db
		.update(items)
		.set({ isArchived: data.archived })
		.where(inArray(items.id, [...data.itemIds]))
	for (const row of loaded.rows) {
		notifyListEvent({ kind: 'item', listId: row.listId, itemId: row.id })
	}
	return { kind: 'ok', updated: data.itemIds.length }
}

export async function archiveListPurchasesImpl(args: {
	userId: string
	input: z.infer<typeof ArchiveListPurchasesInputSchema>
}): Promise<ArchiveListPurchasesResult> {
	const { userId, input: data } = args

	const list = await db.query.lists.findFirst({
		where: eq(lists.id, data.listId),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
	})
	if (!list) return { kind: 'error', reason: 'not-found' }
	const perm = await assertCanEditItems(userId, list)
	if (!perm.ok) return { kind: 'error', reason: 'not-authorized' }

	const claimedRows = await db
		.selectDistinct({ itemId: giftedItems.itemId })
		.from(giftedItems)
		.innerJoin(
			items,
			and(eq(items.id, giftedItems.itemId), eq(items.isArchived, false), isNull(items.pendingDeletionAt), eq(items.listId, list.id))
		)

	if (claimedRows.length === 0) return { kind: 'ok', updated: 0 }

	const ids = claimedRows.map(r => r.itemId)
	await db.update(items).set({ isArchived: true }).where(inArray(items.id, ids))
	for (const id of ids) {
		notifyListEvent({ kind: 'item', listId: list.id, itemId: id })
	}
	return { kind: 'ok', updated: ids.length }
}

export async function deleteItemsImpl(args: { userId: string; input: z.infer<typeof DeleteItemsInputSchema> }): Promise<DeleteItemsResult> {
	const { userId, input: data } = args
	const loaded = await loadAndAuthorizeItems(userId, data.itemIds)
	if (!loaded.ok) return { kind: 'error', reason: loaded.reason }

	const rows = await db.query.items.findMany({
		where: inArray(items.id, [...data.itemIds]),
		columns: { imageUrl: true },
	})

	await db.delete(items).where(inArray(items.id, [...data.itemIds]))
	await cleanupImageUrls(rows.map(r => r.imageUrl))
	for (const row of loaded.rows) {
		notifyListEvent({ kind: 'item', listId: row.listId, itemId: row.id, shape: 'removed' })
	}
	return { kind: 'ok', deleted: data.itemIds.length }
}

export async function setItemsPriorityImpl(args: {
	userId: string
	input: z.infer<typeof SetItemsPriorityInputSchema>
}): Promise<SetItemsPriorityResult> {
	const { userId, input: data } = args
	const loaded = await loadAndAuthorizeItems(userId, data.itemIds)
	if (!loaded.ok) return { kind: 'error', reason: loaded.reason }

	await db
		.update(items)
		.set({ priority: data.priority })
		.where(inArray(items.id, [...data.itemIds]))
	for (const row of loaded.rows) {
		notifyListEvent({ kind: 'item', listId: row.listId, itemId: row.id })
	}
	return { kind: 'ok', updated: data.itemIds.length }
}

export async function reorderItemsImpl(args: {
	userId: string
	input: z.infer<typeof ReorderItemsInputSchema>
}): Promise<ReorderItemsResult> {
	const { userId, input: data } = args

	const list = await db.query.lists.findFirst({
		where: eq(lists.id, data.listId),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
	})
	if (!list) return { kind: 'error', reason: 'not-found' }
	const perm = await assertCanEditItems(userId, list)
	if (!perm.ok) return { kind: 'error', reason: 'not-authorized' }

	const ids = data.updates.map(u => u.itemId)
	const rows = await db.query.items.findMany({
		where: inArray(items.id, ids),
		columns: { id: true, listId: true },
	})
	if (rows.length !== ids.length) return { kind: 'error', reason: 'not-found' }
	if (rows.some(r => r.listId !== data.listId)) return { kind: 'error', reason: 'mixed-lists' }

	await db.transaction(async tx => {
		for (const u of data.updates) {
			await tx
				.update(items)
				.set({ priority: u.priority, sortOrder: u.sortOrder })
				.where(and(eq(items.id, u.itemId), eq(items.listId, data.listId)))
		}
	})
	notifyListEvent({ kind: 'item', listId: data.listId, itemId: -1 })
	return { kind: 'ok', updated: data.updates.length }
}

export async function reorderListEntriesImpl(args: {
	userId: string
	input: z.infer<typeof ReorderEntriesInputSchema>
}): Promise<ReorderEntriesResult> {
	const { userId, input: data } = args

	const list = await db.query.lists.findFirst({
		where: eq(lists.id, data.listId),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
	})
	if (!list) return { kind: 'error', reason: 'not-found' }
	const perm = await assertCanEditItems(userId, list)
	if (!perm.ok) return { kind: 'error', reason: 'not-authorized' }

	if (data.items.length > 0) {
		const itemIds = data.items.map(u => u.itemId)
		const itemRows = await db.query.items.findMany({
			where: inArray(items.id, itemIds),
			columns: { id: true, listId: true },
		})
		if (itemRows.length !== itemIds.length) return { kind: 'error', reason: 'not-found' }
		if (itemRows.some(r => r.listId !== data.listId)) return { kind: 'error', reason: 'mixed-lists' }
	}

	if (data.groups.length > 0) {
		const groupIds = data.groups.map(u => u.groupId)
		const groupRows = await db.query.itemGroups.findMany({
			where: inArray(itemGroups.id, groupIds),
			columns: { id: true, listId: true },
		})
		if (groupRows.length !== groupIds.length) return { kind: 'error', reason: 'not-found' }
		if (groupRows.some(r => r.listId !== data.listId)) return { kind: 'error', reason: 'mixed-lists' }
	}

	await db.transaction(async tx => {
		for (const u of data.items) {
			await tx
				.update(items)
				.set({ priority: u.priority, sortOrder: u.sortOrder })
				.where(and(eq(items.id, u.itemId), eq(items.listId, data.listId)))
		}
		for (const u of data.groups) {
			await tx
				.update(itemGroups)
				.set({ priority: u.priority, sortOrder: u.sortOrder })
				.where(and(eq(itemGroups.id, u.groupId), eq(itemGroups.listId, data.listId)))
		}
	})
	notifyListEvent({ kind: 'item', listId: data.listId, itemId: -1 })
	return { kind: 'ok', updatedItems: data.items.length, updatedGroups: data.groups.length }
}

export async function setGroupsPriorityImpl(args: {
	userId: string
	input: z.infer<typeof SetGroupsPriorityInputSchema>
}): Promise<SetGroupsPriorityResult> {
	const { userId, input: data } = args

	const groupRows = await db.query.itemGroups.findMany({
		where: inArray(itemGroups.id, data.groupIds),
		columns: { id: true, listId: true },
	})
	if (groupRows.length !== data.groupIds.length) return { kind: 'error', reason: 'not-found' }
	const listIds = new Set(groupRows.map(r => r.listId))
	if (listIds.size > 1) return { kind: 'error', reason: 'mixed-lists' }

	const list = await db.query.lists.findFirst({
		where: eq(lists.id, groupRows[0].listId),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
	})
	if (!list) return { kind: 'error', reason: 'not-found' }
	const perm = await assertCanEditItems(userId, list)
	if (!perm.ok) return { kind: 'error', reason: 'not-authorized' }

	await db.update(itemGroups).set({ priority: data.priority }).where(inArray(itemGroups.id, data.groupIds))
	notifyListEvent({ kind: 'item', listId: groupRows[0].listId, itemId: -1 })
	return { kind: 'ok', updated: data.groupIds.length }
}

export async function deleteGroupsImpl(args: {
	userId: string
	input: z.infer<typeof DeleteGroupsInputSchema>
}): Promise<DeleteGroupsResult> {
	const { userId, input: data } = args

	const groupRows = await db.query.itemGroups.findMany({
		where: inArray(itemGroups.id, data.groupIds),
		columns: { id: true, listId: true },
	})
	if (groupRows.length !== data.groupIds.length) return { kind: 'error', reason: 'not-found' }
	const listIds = new Set(groupRows.map(r => r.listId))
	if (listIds.size > 1) return { kind: 'error', reason: 'mixed-lists' }

	const list = await db.query.lists.findFirst({
		where: eq(lists.id, groupRows[0].listId),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
	})
	if (!list) return { kind: 'error', reason: 'not-found' }
	const perm = await assertCanEditItems(userId, list)
	if (!perm.ok) return { kind: 'error', reason: 'not-authorized' }

	const itemRows = await db.query.items.findMany({
		where: inArray(items.groupId, data.groupIds),
		columns: { id: true, imageUrl: true },
	})
	const itemIds = itemRows.map(r => r.id)

	await db.transaction(async tx => {
		if (itemIds.length > 0) await tx.delete(items).where(inArray(items.id, itemIds))
		await tx.delete(itemGroups).where(inArray(itemGroups.id, data.groupIds))
	})

	await cleanupImageUrls(itemRows.map(r => r.imageUrl))
	notifyListEvent({ kind: 'item', listId: groupRows[0].listId, itemId: -1 })
	return { kind: 'ok', deletedGroups: data.groupIds.length, deletedItems: itemIds.length }
}

export async function getItemsForListViewImpl(args: {
	userId: string
	listId: string
	sort?: SortOption
	dbx?: SchemaDatabase
}): Promise<GetItemsForListViewResult> {
	const { dbx = db } = args
	const sort = args.sort ?? ('priority-desc' as SortOption)
	const listId = Number(args.listId)
	if (!Number.isFinite(listId)) return { kind: 'error', reason: 'not-found' }

	const list = await dbx.query.lists.findFirst({
		where: eq(lists.id, listId),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
	})
	if (!list) return { kind: 'error', reason: 'not-found' }

	// For dependent-subject lists the gifter universe doesn't include
	// "the list owner is a real recipient" - the owner is the guardian,
	// not the recipient. Guardians (including the creator) get the same
	// gifter view that any other claimer has.
	if (list.ownerId === args.userId && !list.subjectDependentId) return { kind: 'error', reason: 'is-owner' }

	const view = await canViewList(args.userId, list, dbx)
	if (!view.ok) {
		// Archived-list orphan-resolution exception: render an empty item
		// list so the page can show its orphan-aside instead of failing.
		if (view.reason === 'inactive') return { kind: 'ok', items: [] }
		return { kind: 'error', reason: 'not-visible' }
	}

	const accessLevel = await getViewerAccessLevelForList(args.userId, list, dbx)
	const [sortBy, sortOrder] = sort.split('-') as [string, 'asc' | 'desc']
	const orderBy = sortBy === 'priority' ? [asc(items.id)] : sortOrder === 'asc' ? [asc(items.createdAt)] : [desc(items.createdAt)]

	const [listItemsRaw, viewGroups, groupTypes, viewerRow] = await Promise.all([
		dbx.query.items.findMany({
			where: and(eq(items.listId, list.id), eq(items.isArchived, false), isNull(items.pendingDeletionAt)),
			orderBy,
			with: {
				gifts: {
					columns: {
						id: true,
						itemId: true,
						gifterId: true,
						quantity: true,
						notes: true,
						totalCost: true,
						additionalGifterIds: true,
						createdAt: true,
					},
					with: {
						gifter: {
							columns: { id: true, name: true, email: true, image: true },
						},
					},
				},
			},
		}),
		dbx.query.itemGroups.findMany({
			where: eq(itemGroups.listId, list.id),
			columns: { id: true, priority: true },
		}),
		dbx.query.itemGroups.findMany({
			where: eq(itemGroups.listId, list.id),
			columns: { id: true, type: true },
		}),
		accessLevel === 'restricted'
			? dbx.query.users.findFirst({ where: eq(users.id, args.userId), columns: { partnerId: true } })
			: Promise.resolve(null),
	])

	const listItems =
		accessLevel === 'restricted'
			? filterItemsForRestricted(listItemsRaw, groupTypes, args.userId, viewerRow?.partnerId ?? null)
			: listItemsRaw

	const commentCountRows = listItems.length
		? await dbx
				.select({ itemId: itemComments.itemId, count: count(itemComments.id) })
				.from(itemComments)
				.where(
					inArray(
						itemComments.itemId,
						listItems.map(i => i.id)
					)
				)
				.groupBy(itemComments.itemId)
		: []
	const commentCountByItem = new Map(commentCountRows.map(r => [r.itemId, Number(r.count)]))

	let sortedItems = listItems
	if (sortBy === 'priority') {
		const rank: Record<Priority, number> = { 'very-high': 4, high: 3, normal: 2, low: 1 }
		const groupPriorityById = new Map(viewGroups.map(g => [g.id, g.priority]))
		const effective = (i: (typeof listItems)[number]) => (i.groupId !== null ? groupPriorityById.get(i.groupId) : undefined) ?? i.priority
		sortedItems = [...listItems].sort((a, b) => {
			const diff = rank[effective(a)] - rank[effective(b)]
			if (diff !== 0) return sortOrder === 'asc' ? diff : -diff
			return a.id - b.id
		})
	}

	return {
		kind: 'ok',
		items: sortedItems.map(i => ({ ...i, commentCount: commentCountByItem.get(i.id) ?? 0 })),
	}
}

export async function getItemsForListEditImpl(args: {
	userId: string
	listId: string
	includeArchived?: boolean
	dbx?: SchemaDatabase
}): Promise<GetItemsForListEditResult> {
	const { dbx = db } = args
	const listId = Number(args.listId)
	if (!Number.isFinite(listId)) return { kind: 'error', reason: 'not-found' }

	const list = await dbx.query.lists.findFirst({
		where: eq(lists.id, listId),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
	})
	if (!list) return { kind: 'error', reason: 'not-found' }

	const isOwner = list.ownerId === args.userId
	if (!isOwner) {
		const edit = await canEditList(args.userId, list, dbx)
		if (!edit.ok) return { kind: 'error', reason: 'not-authorized' }
	}

	// Pending-deletion items are invisible to the recipient even with
	// `includeArchived` (which surfaces revealed gifts in the organize
	// view). Spoiler protection extends to that view.
	const listItems = await dbx.query.items.findMany({
		where: args.includeArchived
			? and(eq(items.listId, list.id), isNull(items.pendingDeletionAt))
			: and(eq(items.listId, list.id), eq(items.isArchived, false), isNull(items.pendingDeletionAt)),
		orderBy: [desc(items.createdAt)],
	})

	const commentCountRows = listItems.length
		? await dbx
				.select({ itemId: itemComments.itemId, count: count(itemComments.id) })
				.from(itemComments)
				.where(
					inArray(
						itemComments.itemId,
						listItems.map(i => i.id)
					)
				)
				.groupBy(itemComments.itemId)
		: []
	const commentCountByItem = new Map(commentCountRows.map(r => [r.itemId, Number(r.count)]))

	return {
		kind: 'ok',
		items: listItems.map(i => ({ ...i, commentCount: commentCountByItem.get(i.id) ?? 0 })),
	}
}
