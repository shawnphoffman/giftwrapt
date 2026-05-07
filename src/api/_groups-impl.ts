// Server-only implementations for item groups. Lives in a separate
// file from `groups.ts` so the static import chain into `db`,
// drizzle ops, and the permissions helper stays out of the client
// bundle. `groups.ts` only references these from inside server-fn
// handler / inputValidator bodies.

import { and, asc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { giftedItems, itemComments, itemGroups, items, lists } from '@/db/schema'
import { type GroupType, groupTypeEnumValues, type ListType, type Priority, priorityEnumValues } from '@/db/schema/enums'
import type { ItemGroup } from '@/db/schema/items'
import { canEditList } from '@/lib/permissions'
import { notifyListEvent } from '@/routes/api/sse/list.$listId'

// ===============================
// Public types
// ===============================

export type CreateGroupResult = { kind: 'ok'; group: ItemGroup } | { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export type UpdateGroupResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export type DeleteGroupResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export type MoveGroupResult =
	| { kind: 'ok'; movedItems: number; claimsCleared: number; commentsDeleted: number }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' | 'same-list' }

export type AssignItemsResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-authorized' | 'mixed-lists' }

export type ReorderResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export type GroupWithItems = {
	id: number
	type: GroupType
	name: string | null
	priority: Priority
	itemIds: Array<number>
}

// ===============================
// Input schemas
// ===============================

export const CreateGroupInputSchema = z.object({
	listId: z.number().int().positive(),
	type: z.enum(groupTypeEnumValues),
})

export const UpdateGroupInputSchema = z
	.object({
		groupId: z.number().int().positive(),
		type: z.enum(groupTypeEnumValues).optional(),
		name: z.string().trim().max(100).nullable().optional(),
		priority: z.enum(priorityEnumValues).optional(),
	})
	.refine(d => d.type !== undefined || d.name !== undefined || d.priority !== undefined, {
		message: 'At least one of type, name, or priority must be provided',
	})

export const DeleteGroupInputSchema = z.object({
	groupId: z.number().int().positive(),
})

export const MoveGroupInputSchema = z.object({
	groupId: z.number().int().positive(),
	targetListId: z.number().int().positive(),
	purgeComments: z.boolean().default(false),
})

export const AssignItemsInputSchema = z.object({
	groupId: z.number().int().positive().nullable(),
	itemIds: z.array(z.number().int().positive()).min(1).max(100),
})

export const ReorderGroupItemsInputSchema = z.object({
	groupId: z.number().int().positive(),
	itemIds: z.array(z.number().int().positive()).min(1).max(100),
})

// ===============================
// Helpers
// ===============================

type ListForPerm = { id: number; ownerId: string; subjectDependentId: string | null; isPrivate: boolean; isActive: boolean }

async function loadListForEdit(
	userId: string,
	listId: number
): Promise<{ ok: true; list: ListForPerm } | { ok: false; reason: 'not-found' | 'not-authorized' }> {
	const list = await db.query.lists.findFirst({
		where: eq(lists.id, listId),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
	})
	if (!list) return { ok: false, reason: 'not-found' }
	if (list.ownerId !== userId) {
		const edit = await canEditList(userId, list)
		if (!edit.ok) return { ok: false, reason: 'not-authorized' }
	}
	return { ok: true, list }
}

const SPOILER_PROTECTED_TYPES: ReadonlySet<ListType> = new Set(['wishlist', 'christmas', 'birthday'])

function isCrossTypeMoveDestructive(sourceType: ListType, targetType: ListType): boolean {
	if (sourceType === targetType) return false
	if (SPOILER_PROTECTED_TYPES.has(sourceType) && SPOILER_PROTECTED_TYPES.has(targetType)) return false
	return true
}

// ===============================
// Impls
// ===============================

export async function createItemGroupImpl(args: {
	userId: string
	input: z.infer<typeof CreateGroupInputSchema>
}): Promise<CreateGroupResult> {
	const { userId, input: data } = args
	const perm = await loadListForEdit(userId, data.listId)
	if (!perm.ok) return { kind: 'error', reason: perm.reason }
	const [inserted] = await db.insert(itemGroups).values({ listId: data.listId, type: data.type }).returning()
	notifyListEvent({ kind: 'item', listId: data.listId, itemId: -1 })
	return { kind: 'ok', group: inserted }
}

export async function updateItemGroupImpl(args: {
	userId: string
	input: z.infer<typeof UpdateGroupInputSchema>
}): Promise<UpdateGroupResult> {
	const { userId, input: data } = args

	const group = await db.query.itemGroups.findFirst({
		where: eq(itemGroups.id, data.groupId),
		columns: { id: true, listId: true },
	})
	if (!group) return { kind: 'error', reason: 'not-found' }

	const perm = await loadListForEdit(userId, group.listId)
	if (!perm.ok) return { kind: 'error', reason: perm.reason }

	const updates: { type?: GroupType; name?: string | null; priority?: Priority } = {}
	if (data.type !== undefined) updates.type = data.type
	if (data.name !== undefined) updates.name = data.name === '' ? null : data.name
	if (data.priority !== undefined) updates.priority = data.priority

	await db.update(itemGroups).set(updates).where(eq(itemGroups.id, data.groupId))
	notifyListEvent({ kind: 'item', listId: group.listId, itemId: -1 })
	return { kind: 'ok' }
}

export async function deleteItemGroupImpl(args: {
	userId: string
	input: z.infer<typeof DeleteGroupInputSchema>
}): Promise<DeleteGroupResult> {
	const { userId, input: data } = args

	const group = await db.query.itemGroups.findFirst({
		where: eq(itemGroups.id, data.groupId),
		columns: { id: true, listId: true },
	})
	if (!group) return { kind: 'error', reason: 'not-found' }

	const perm = await loadListForEdit(userId, group.listId)
	if (!perm.ok) return { kind: 'error', reason: perm.reason }

	await db.update(items).set({ groupSortOrder: null }).where(eq(items.groupId, data.groupId))
	await db.delete(itemGroups).where(eq(itemGroups.id, data.groupId))
	notifyListEvent({ kind: 'item', listId: group.listId, itemId: -1 })
	return { kind: 'ok' }
}

export async function moveGroupToListImpl(args: { userId: string; input: z.infer<typeof MoveGroupInputSchema> }): Promise<MoveGroupResult> {
	const { userId, input: data } = args

	const group = await db.query.itemGroups.findFirst({
		where: eq(itemGroups.id, data.groupId),
		columns: { id: true, listId: true },
	})
	if (!group) return { kind: 'error', reason: 'not-found' }
	if (group.listId === data.targetListId) return { kind: 'error', reason: 'same-list' }

	const sourceList = await db.query.lists.findFirst({
		where: eq(lists.id, group.listId),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true, type: true },
	})
	if (!sourceList) return { kind: 'error', reason: 'not-found' }
	const sourcePerm = await loadListForEdit(userId, sourceList.id)
	if (!sourcePerm.ok) return { kind: 'error', reason: sourcePerm.reason }

	const targetList = await db.query.lists.findFirst({
		where: eq(lists.id, data.targetListId),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true, type: true },
	})
	if (!targetList) return { kind: 'error', reason: 'not-found' }
	const targetPerm = await loadListForEdit(userId, targetList.id)
	if (!targetPerm.ok) return { kind: 'error', reason: targetPerm.reason }

	const groupItems = await db.query.items.findMany({
		where: eq(items.groupId, data.groupId),
		columns: { id: true },
	})
	const itemIds = groupItems.map(i => i.id)

	const destructive = isCrossTypeMoveDestructive(sourceList.type, targetList.type)

	const result = await db.transaction(async tx => {
		await tx.update(itemGroups).set({ listId: data.targetListId }).where(eq(itemGroups.id, data.groupId))

		if (itemIds.length > 0) {
			await tx.update(items).set({ listId: data.targetListId }).where(inArray(items.id, itemIds))
		}

		let claimsCleared = 0
		if (destructive && itemIds.length > 0) {
			const deleted = await tx.delete(giftedItems).where(inArray(giftedItems.itemId, itemIds)).returning({ id: giftedItems.id })
			claimsCleared = deleted.length
		}

		let commentsDeleted = 0
		if (data.purgeComments && itemIds.length > 0) {
			const deleted = await tx.delete(itemComments).where(inArray(itemComments.itemId, itemIds)).returning({ id: itemComments.id })
			commentsDeleted = deleted.length
		}

		return { kind: 'ok' as const, movedItems: itemIds.length, claimsCleared, commentsDeleted }
	})

	notifyListEvent({ kind: 'item', listId: group.listId, itemId: -1, shape: 'removed' })
	notifyListEvent({ kind: 'item', listId: data.targetListId, itemId: -1, shape: 'added' })

	return result
}

export async function assignItemsToGroupImpl(args: {
	userId: string
	input: z.infer<typeof AssignItemsInputSchema>
}): Promise<AssignItemsResult> {
	const { userId, input: data } = args

	const itemRows = await db.query.items.findMany({
		where: inArray(items.id, data.itemIds),
		columns: { id: true, listId: true },
	})
	if (itemRows.length !== data.itemIds.length) return { kind: 'error', reason: 'not-found' }

	const listIds = new Set(itemRows.map(r => r.listId))
	if (listIds.size > 1) return { kind: 'error', reason: 'mixed-lists' }

	const listId = itemRows[0].listId

	if (data.groupId !== null) {
		const group = await db.query.itemGroups.findFirst({
			where: and(eq(itemGroups.id, data.groupId), eq(itemGroups.listId, listId)),
			columns: { id: true },
		})
		if (!group) return { kind: 'error', reason: 'not-found' }
	}

	const perm = await loadListForEdit(userId, listId)
	if (!perm.ok) return { kind: 'error', reason: perm.reason }

	const setData = data.groupId === null ? { groupId: null, groupSortOrder: null } : { groupId: data.groupId }
	await db.update(items).set(setData).where(inArray(items.id, data.itemIds))

	notifyListEvent({ kind: 'item', listId, itemId: -1 })
	return { kind: 'ok' }
}

export async function reorderGroupItemsImpl(args: {
	userId: string
	input: z.infer<typeof ReorderGroupItemsInputSchema>
}): Promise<ReorderResult> {
	const { userId, input: data } = args

	const group = await db.query.itemGroups.findFirst({
		where: eq(itemGroups.id, data.groupId),
		columns: { id: true, listId: true },
	})
	if (!group) return { kind: 'error', reason: 'not-found' }

	const perm = await loadListForEdit(userId, group.listId)
	if (!perm.ok) return { kind: 'error', reason: perm.reason }

	await db.transaction(async tx => {
		for (let i = 0; i < data.itemIds.length; i++) {
			await tx
				.update(items)
				.set({ groupSortOrder: i })
				.where(and(eq(items.id, data.itemIds[i]), eq(items.groupId, data.groupId)))
		}
	})

	notifyListEvent({ kind: 'item', listId: group.listId, itemId: -1 })
	return { kind: 'ok' }
}

export async function getGroupsForListImpl(args: { listId: number }): Promise<Array<GroupWithItems>> {
	const { listId } = args
	const groups = await db.query.itemGroups.findMany({
		where: eq(itemGroups.listId, listId),
	})

	const allItems = await db.query.items.findMany({
		where: and(eq(items.listId, listId), eq(items.isArchived, false)),
		columns: { id: true, groupId: true, groupSortOrder: true },
		orderBy: [asc(items.groupSortOrder), asc(items.id)],
	})

	return groups.map(g => ({
		id: g.id,
		type: g.type,
		name: g.name,
		priority: g.priority,
		itemIds: allItems.filter(i => i.groupId === g.id).map(i => i.id),
	}))
}
