import { createServerFn } from '@tanstack/react-start'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { giftedItems, itemComments, items, lists } from '@/db/schema'
import { type ListType, priorityEnumValues, statusEnumValues } from '@/db/schema/enums'
import type { Item } from '@/db/schema/items'
import { canEditList } from '@/lib/permissions'
import { authMiddleware } from '@/middleware/auth'

// ===============================
// Helpers
// ===============================

type ListForPermCheck = { id: number; ownerId: string; isPrivate: boolean; isActive: boolean }

/** Check if userId is the list owner or has edit permission. */
async function assertCanEditItems(userId: string, list: ListForPermCheck): Promise<{ ok: true } | { ok: false; reason: 'not-authorized' }> {
	if (list.ownerId === userId) return { ok: true }
	const edit = await canEditList(userId, list)
	if (!edit.ok) return { ok: false, reason: 'not-authorized' }
	return { ok: true }
}

// ===============================
// WRITE — create an item
// ===============================

const CreateItemInputSchema = z.object({
	listId: z.number().int().positive(),
	title: z.string().min(1).max(500),
	url: z.string().max(2000).optional(),
	price: z.string().max(50).optional(),
	currency: z.string().max(10).optional(),
	notes: z.string().max(5000).optional(),
	priority: z.enum(priorityEnumValues).optional(),
	quantity: z.number().int().positive().max(999).optional(),
	imageUrl: z.string().max(2000).optional(),
	groupId: z.number().int().positive().optional(),
})

export type CreateItemResult =
	| { kind: 'ok'; item: Item }
	| { kind: 'error'; reason: 'list-not-found' | 'not-authorized' }

export const createItem = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.input<typeof CreateItemInputSchema>) => CreateItemInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<CreateItemResult> => {
		const userId = context.session.user.id

		const list = await db.query.lists.findFirst({
			where: eq(lists.id, data.listId),
			columns: { id: true, ownerId: true, isPrivate: true, isActive: true },
		})
		if (!list) return { kind: 'error', reason: 'list-not-found' }

		const perm = await assertCanEditItems(userId, list)
		if (!perm.ok) return { kind: 'error', reason: 'not-authorized' }

		const [inserted] = await db
			.insert(items)
			.values({
				listId: data.listId,
				title: data.title,
				url: data.url ?? null,
				price: data.price ?? null,
				currency: data.currency ?? null,
				notes: data.notes ?? null,
				priority: data.priority ?? 'normal',
				quantity: data.quantity ?? 1,
				imageUrl: data.imageUrl ?? null,
				groupId: data.groupId ?? null,
			})
			.returning()

		return { kind: 'ok', item: inserted }
	})

// ===============================
// WRITE — update an item
// ===============================
// Partial update: undefined = don't touch, null = clear the field.
// Bumps modifiedAt when title, url, or notes change (per spec).

const UpdateItemInputSchema = z.object({
	itemId: z.number().int().positive(),
	title: z.string().min(1).max(500).optional(),
	url: z.string().max(2000).nullable().optional(),
	price: z.string().max(50).nullable().optional(),
	currency: z.string().max(10).nullable().optional(),
	notes: z.string().max(5000).nullable().optional(),
	priority: z.enum(priorityEnumValues).optional(),
	quantity: z.number().int().positive().max(999).optional(),
	imageUrl: z.string().max(2000).nullable().optional(),
	status: z.enum(statusEnumValues).optional(),
})

export type UpdateItemResult =
	| { kind: 'ok'; item: Item }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export const updateItem = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.input<typeof UpdateItemInputSchema>) => UpdateItemInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<UpdateItemResult> => {
		const userId = context.session.user.id

		const item = await db.query.items.findFirst({
			where: eq(items.id, data.itemId),
			columns: { id: true, listId: true },
		})
		if (!item) return { kind: 'error', reason: 'not-found' }

		const list = await db.query.lists.findFirst({
			where: eq(lists.id, item.listId),
			columns: { id: true, ownerId: true, isPrivate: true, isActive: true },
		})
		if (!list) return { kind: 'error', reason: 'not-found' }

		const perm = await assertCanEditItems(userId, list)
		if (!perm.ok) return { kind: 'error', reason: 'not-authorized' }

		const updates: Record<string, unknown> = {}
		let bumpModifiedAt = false

		if (data.title !== undefined) {
			updates.title = data.title
			bumpModifiedAt = true
		}
		if (data.url !== undefined) {
			updates.url = data.url
			bumpModifiedAt = true
		}
		if (data.notes !== undefined) {
			updates.notes = data.notes
			bumpModifiedAt = true
		}
		if (data.price !== undefined) updates.price = data.price
		if (data.currency !== undefined) updates.currency = data.currency
		if (data.priority !== undefined) updates.priority = data.priority
		if (data.quantity !== undefined) updates.quantity = data.quantity
		if (data.imageUrl !== undefined) updates.imageUrl = data.imageUrl
		if (data.status !== undefined) updates.status = data.status

		if (bumpModifiedAt) {
			updates.modifiedAt = new Date()
		}

		if (Object.keys(updates).length === 0) {
			const fullItem = await db.query.items.findFirst({ where: eq(items.id, data.itemId) })
			return { kind: 'ok', item: fullItem! }
		}

		const [updated] = await db.update(items).set(updates).where(eq(items.id, data.itemId)).returning()
		return { kind: 'ok', item: updated }
	})

// ===============================
// WRITE — delete an item
// ===============================
// Hard delete. FK cascades handle claims and comments.

const DeleteItemInputSchema = z.object({
	itemId: z.number().int().positive(),
})

export type DeleteItemResult =
	| { kind: 'ok' }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export const deleteItem = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.input<typeof DeleteItemInputSchema>) => DeleteItemInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<DeleteItemResult> => {
		const userId = context.session.user.id

		const item = await db.query.items.findFirst({
			where: eq(items.id, data.itemId),
			columns: { id: true, listId: true },
		})
		if (!item) return { kind: 'error', reason: 'not-found' }

		const list = await db.query.lists.findFirst({
			where: eq(lists.id, item.listId),
			columns: { id: true, ownerId: true, isPrivate: true, isActive: true },
		})
		if (!list) return { kind: 'error', reason: 'not-found' }

		const perm = await assertCanEditItems(userId, list)
		if (!perm.ok) return { kind: 'error', reason: 'not-authorized' }

		await db.delete(items).where(eq(items.id, data.itemId))
		return { kind: 'ok' }
	})

// ===============================
// WRITE — archive/unarchive an item
// ===============================

const ArchiveItemInputSchema = z.object({
	itemId: z.number().int().positive(),
	archived: z.boolean(),
})

export type ArchiveItemResult =
	| { kind: 'ok' }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export const archiveItem = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.input<typeof ArchiveItemInputSchema>) => ArchiveItemInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<ArchiveItemResult> => {
		const userId = context.session.user.id

		const item = await db.query.items.findFirst({
			where: eq(items.id, data.itemId),
			columns: { id: true, listId: true },
		})
		if (!item) return { kind: 'error', reason: 'not-found' }

		const list = await db.query.lists.findFirst({
			where: eq(lists.id, item.listId),
			columns: { id: true, ownerId: true, isPrivate: true, isActive: true },
		})
		if (!list) return { kind: 'error', reason: 'not-found' }

		const perm = await assertCanEditItems(userId, list)
		if (!perm.ok) return { kind: 'error', reason: 'not-authorized' }

		await db.update(items).set({ isArchived: data.archived }).where(eq(items.id, data.itemId))
		return { kind: 'ok' }
	})

// ===============================
// WRITE — move an item to another list
// ===============================
// Cross-type moves (e.g. wishlist → todo) delete associated claims because
// spoiler protection semantics differ between list types.

const MoveItemInputSchema = z.object({
	itemId: z.number().int().positive(),
	targetListId: z.number().int().positive(),
})

export type MoveItemResult =
	| { kind: 'ok'; claimsCleared: boolean }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' | 'same-list' }

/** List types that share spoiler protection semantics. */
const SPOILER_PROTECTED_TYPES: ReadonlySet<ListType> = new Set(['wishlist', 'christmas', 'birthday'])

function isCrossTypeMoveDestructive(sourceType: ListType, targetType: ListType): boolean {
	if (sourceType === targetType) return false
	// Moving between spoiler-protected types is safe.
	if (SPOILER_PROTECTED_TYPES.has(sourceType) && SPOILER_PROTECTED_TYPES.has(targetType)) return false
	return true
}

export const moveItemToList = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.input<typeof MoveItemInputSchema>) => MoveItemInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<MoveItemResult> => {
		const userId = context.session.user.id

		const item = await db.query.items.findFirst({
			where: eq(items.id, data.itemId),
			columns: { id: true, listId: true },
		})
		if (!item) return { kind: 'error', reason: 'not-found' }
		if (item.listId === data.targetListId) return { kind: 'error', reason: 'same-list' }

		// Check permission on source list.
		const sourceList = await db.query.lists.findFirst({
			where: eq(lists.id, item.listId),
			columns: { id: true, ownerId: true, isPrivate: true, isActive: true, type: true },
		})
		if (!sourceList) return { kind: 'error', reason: 'not-found' }

		const sourcePerm = await assertCanEditItems(userId, sourceList)
		if (!sourcePerm.ok) return { kind: 'error', reason: 'not-authorized' }

		// Check permission on target list.
		const targetList = await db.query.lists.findFirst({
			where: eq(lists.id, data.targetListId),
			columns: { id: true, ownerId: true, isPrivate: true, isActive: true, type: true },
		})
		if (!targetList) return { kind: 'error', reason: 'not-found' }

		const targetPerm = await assertCanEditItems(userId, targetList)
		if (!targetPerm.ok) return { kind: 'error', reason: 'not-authorized' }

		const destructive = isCrossTypeMoveDestructive(sourceList.type, targetList.type)

		return await db.transaction(async tx => {
			// Move the item.
			await tx.update(items).set({ listId: data.targetListId }).where(eq(items.id, data.itemId))

			// Clear claims on cross-type moves.
			let claimsCleared = false
			if (destructive) {
				const deleted = await tx.delete(giftedItems).where(eq(giftedItems.itemId, data.itemId)).returning({ id: giftedItems.id })
				claimsCleared = deleted.length > 0
			}

			return { kind: 'ok', claimsCleared }
		})
	})

// ===============================
// BULK — shared helpers
// ===============================

const BulkIdsSchema = z.array(z.number().int().positive()).min(1).max(500)

type ItemRow = { id: number; listId: number }

/** Load items by id and assert the user can edit every source list. */
async function loadAndAuthorizeItems(
	userId: string,
	itemIds: readonly number[],
): Promise<
	| { ok: true; rows: ItemRow[]; lists: Map<number, ListForPermCheck & { type: ListType }> }
	| { ok: false; reason: 'not-found' | 'not-authorized' }
> {
	const rows = await db.query.items.findMany({
		where: inArray(items.id, [...itemIds]),
		columns: { id: true, listId: true },
	})
	if (rows.length !== itemIds.length) return { ok: false, reason: 'not-found' }

	const listIds = [...new Set(rows.map(r => r.listId))]
	const listRows = await db.query.lists.findMany({
		where: inArray(lists.id, listIds),
		columns: { id: true, ownerId: true, isPrivate: true, isActive: true, type: true },
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
// BULK — move items to another list
// ===============================

const MoveItemsInputSchema = z.object({
	itemIds: BulkIdsSchema,
	targetListId: z.number().int().positive(),
	purgeComments: z.boolean().default(false),
})

export type MoveItemsResult =
	| { kind: 'ok'; moved: number; claimsCleared: number; commentsDeleted: number }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export const moveItemsToList = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.input<typeof MoveItemsInputSchema>) => MoveItemsInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<MoveItemsResult> => {
		const userId = context.session.user.id

		const loaded = await loadAndAuthorizeItems(userId, data.itemIds)
		if (!loaded.ok) return { kind: 'error', reason: loaded.reason }

		const targetList = await db.query.lists.findFirst({
			where: eq(lists.id, data.targetListId),
			columns: { id: true, ownerId: true, isPrivate: true, isActive: true, type: true },
		})
		if (!targetList) return { kind: 'error', reason: 'not-found' }
		const targetPerm = await assertCanEditItems(userId, targetList)
		if (!targetPerm.ok) return { kind: 'error', reason: 'not-authorized' }

		const destructiveItemIds = loaded.rows
			.filter(r => r.listId !== data.targetListId)
			.filter(r => {
				const src = loaded.lists.get(r.listId)!
				return isCrossTypeMoveDestructive(src.type, targetList.type)
			})
			.map(r => r.id)

		return await db.transaction(async tx => {
			await tx
				.update(items)
				.set({ listId: data.targetListId, groupId: null, groupSortOrder: null })
				.where(inArray(items.id, [...data.itemIds]))

			let claimsCleared = 0
			if (destructiveItemIds.length > 0) {
				const deleted = await tx
					.delete(giftedItems)
					.where(inArray(giftedItems.itemId, destructiveItemIds))
					.returning({ id: giftedItems.id })
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

			return { kind: 'ok', moved: data.itemIds.length, claimsCleared, commentsDeleted }
		})
	})

// ===============================
// BULK — archive / unarchive
// ===============================

const ArchiveItemsInputSchema = z.object({
	itemIds: BulkIdsSchema,
	archived: z.boolean(),
})

export type ArchiveItemsResult =
	| { kind: 'ok'; updated: number }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export const archiveItems = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.input<typeof ArchiveItemsInputSchema>) => ArchiveItemsInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<ArchiveItemsResult> => {
		const userId = context.session.user.id
		const loaded = await loadAndAuthorizeItems(userId, data.itemIds)
		if (!loaded.ok) return { kind: 'error', reason: loaded.reason }

		await db.update(items).set({ isArchived: data.archived }).where(inArray(items.id, [...data.itemIds]))
		return { kind: 'ok', updated: data.itemIds.length }
	})

// ===============================
// BULK — delete
// ===============================

const DeleteItemsInputSchema = z.object({
	itemIds: BulkIdsSchema,
})

export type DeleteItemsResult =
	| { kind: 'ok'; deleted: number }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export const deleteItems = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.input<typeof DeleteItemsInputSchema>) => DeleteItemsInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<DeleteItemsResult> => {
		const userId = context.session.user.id
		const loaded = await loadAndAuthorizeItems(userId, data.itemIds)
		if (!loaded.ok) return { kind: 'error', reason: loaded.reason }

		await db.delete(items).where(inArray(items.id, [...data.itemIds]))
		return { kind: 'ok', deleted: data.itemIds.length }
	})

// ===============================
// BULK — set priority
// ===============================

const SetItemsPriorityInputSchema = z.object({
	itemIds: BulkIdsSchema,
	priority: z.enum(priorityEnumValues),
})

export type SetItemsPriorityResult =
	| { kind: 'ok'; updated: number }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export const setItemsPriority = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.input<typeof SetItemsPriorityInputSchema>) => SetItemsPriorityInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<SetItemsPriorityResult> => {
		const userId = context.session.user.id
		const loaded = await loadAndAuthorizeItems(userId, data.itemIds)
		if (!loaded.ok) return { kind: 'error', reason: loaded.reason }

		await db.update(items).set({ priority: data.priority }).where(inArray(items.id, [...data.itemIds]))
		return { kind: 'ok', updated: data.itemIds.length }
	})

// ===============================
// BULK — reorder items across priority buckets on one list
// ===============================
// Accepts per-item priority + sortOrder. All items must belong to `listId`.

const ReorderItemsInputSchema = z.object({
	listId: z.number().int().positive(),
	updates: z
		.array(
			z.object({
				itemId: z.number().int().positive(),
				priority: z.enum(priorityEnumValues),
				sortOrder: z.number().int().min(0),
			}),
		)
		.min(1)
		.max(500),
})

export type ReorderItemsResult =
	| { kind: 'ok'; updated: number }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' | 'mixed-lists' }

export const reorderItems = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.input<typeof ReorderItemsInputSchema>) => ReorderItemsInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<ReorderItemsResult> => {
		const userId = context.session.user.id

		const list = await db.query.lists.findFirst({
			where: eq(lists.id, data.listId),
			columns: { id: true, ownerId: true, isPrivate: true, isActive: true },
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
		return { kind: 'ok', updated: data.updates.length }
	})
