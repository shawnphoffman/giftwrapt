import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { itemGroups, items, lists } from '@/db/schema'
import { groupTypeEnumValues, type GroupType } from '@/db/schema/enums'
import type { ItemGroup } from '@/db/schema/items'
import { canEditList } from '@/lib/permissions'
import { authMiddleware } from '@/middleware/auth'

// ===============================
// Helpers
// ===============================

type ListForPerm = { id: number; ownerId: string; isPrivate: boolean; isActive: boolean }

async function loadListForEdit(userId: string, listId: number): Promise<{ ok: true; list: ListForPerm } | { ok: false; reason: 'not-found' | 'not-authorized' }> {
	const list = await db.query.lists.findFirst({
		where: eq(lists.id, listId),
		columns: { id: true, ownerId: true, isPrivate: true, isActive: true },
	})
	if (!list) return { ok: false, reason: 'not-found' }
	if (list.ownerId !== userId) {
		const edit = await canEditList(userId, list)
		if (!edit.ok) return { ok: false, reason: 'not-authorized' }
	}
	return { ok: true, list }
}

// ===============================
// CREATE — group on a list
// ===============================

const CreateGroupInputSchema = z.object({
	listId: z.number().int().positive(),
	type: z.enum(groupTypeEnumValues),
})

export type CreateGroupResult =
	| { kind: 'ok'; group: ItemGroup }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export const createItemGroup = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.input<typeof CreateGroupInputSchema>) => CreateGroupInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<CreateGroupResult> => {
		const userId = context.session.user.id

		const perm = await loadListForEdit(userId, data.listId)
		if (!perm.ok) return { kind: 'error', reason: perm.reason }

		const [inserted] = await db
			.insert(itemGroups)
			.values({ listId: data.listId, type: data.type })
			.returning()

		return { kind: 'ok', group: inserted }
	})

// ===============================
// UPDATE — change group type
// ===============================

const UpdateGroupInputSchema = z.object({
	groupId: z.number().int().positive(),
	type: z.enum(groupTypeEnumValues),
})

export type UpdateGroupResult =
	| { kind: 'ok' }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export const updateItemGroup = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.input<typeof UpdateGroupInputSchema>) => UpdateGroupInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<UpdateGroupResult> => {
		const userId = context.session.user.id

		const group = await db.query.itemGroups.findFirst({
			where: eq(itemGroups.id, data.groupId),
			columns: { id: true, listId: true },
		})
		if (!group) return { kind: 'error', reason: 'not-found' }

		const perm = await loadListForEdit(userId, group.listId)
		if (!perm.ok) return { kind: 'error', reason: perm.reason }

		await db.update(itemGroups).set({ type: data.type }).where(eq(itemGroups.id, data.groupId))
		return { kind: 'ok' }
	})

// ===============================
// DELETE — group (items keep existing, just lose grouping)
// ===============================

const DeleteGroupInputSchema = z.object({
	groupId: z.number().int().positive(),
})

export type DeleteGroupResult =
	| { kind: 'ok' }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export const deleteItemGroup = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.input<typeof DeleteGroupInputSchema>) => DeleteGroupInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<DeleteGroupResult> => {
		const userId = context.session.user.id

		const group = await db.query.itemGroups.findFirst({
			where: eq(itemGroups.id, data.groupId),
			columns: { id: true, listId: true },
		})
		if (!group) return { kind: 'error', reason: 'not-found' }

		const perm = await loadListForEdit(userId, group.listId)
		if (!perm.ok) return { kind: 'error', reason: perm.reason }

		// FK has onDelete: 'set null' so items.group_id auto-clears.
		// Also clear groupSortOrder for affected items.
		await db
			.update(items)
			.set({ groupSortOrder: null })
			.where(eq(items.groupId, data.groupId))

		await db.delete(itemGroups).where(eq(itemGroups.id, data.groupId))
		return { kind: 'ok' }
	})

// ===============================
// ASSIGN — set/clear group on items
// ===============================

const AssignItemsInputSchema = z.object({
	groupId: z.number().int().positive().nullable(),
	itemIds: z.array(z.number().int().positive()).min(1).max(100),
})

export type AssignItemsResult =
	| { kind: 'ok' }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' | 'mixed-lists' }

export const assignItemsToGroup = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.input<typeof AssignItemsInputSchema>) => AssignItemsInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<AssignItemsResult> => {
		const userId = context.session.user.id

		// Fetch all items to verify they're on the same list and find the listId.
		const itemRows = await db.query.items.findMany({
			where: inArray(items.id, data.itemIds),
			columns: { id: true, listId: true },
		})
		if (itemRows.length !== data.itemIds.length) return { kind: 'error', reason: 'not-found' }

		const listIds = new Set(itemRows.map(r => r.listId))
		if (listIds.size > 1) return { kind: 'error', reason: 'mixed-lists' }

		const listId = itemRows[0].listId

		// If assigning to a group, verify the group is on the same list.
		if (data.groupId !== null) {
			const group = await db.query.itemGroups.findFirst({
				where: and(eq(itemGroups.id, data.groupId), eq(itemGroups.listId, listId)),
				columns: { id: true },
			})
			if (!group) return { kind: 'error', reason: 'not-found' }
		}

		const perm = await loadListForEdit(userId, listId)
		if (!perm.ok) return { kind: 'error', reason: perm.reason }

		// When unassigning, also clear sort order.
		const setData = data.groupId === null ? { groupId: null, groupSortOrder: null } : { groupId: data.groupId }
		await db.update(items).set(setData).where(inArray(items.id, data.itemIds))

		return { kind: 'ok' }
	})

// ===============================
// REORDER — set sort order for items in an order group
// ===============================

const ReorderInputSchema = z.object({
	groupId: z.number().int().positive(),
	itemIds: z.array(z.number().int().positive()).min(1).max(100),
})

export type ReorderResult =
	| { kind: 'ok' }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export const reorderGroupItems = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.input<typeof ReorderInputSchema>) => ReorderInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<ReorderResult> => {
		const userId = context.session.user.id

		const group = await db.query.itemGroups.findFirst({
			where: eq(itemGroups.id, data.groupId),
			columns: { id: true, listId: true },
		})
		if (!group) return { kind: 'error', reason: 'not-found' }

		const perm = await loadListForEdit(userId, group.listId)
		if (!perm.ok) return { kind: 'error', reason: perm.reason }

		// Apply the order. Items not in this group are ignored by the WHERE clause.
		await db.transaction(async tx => {
			for (let i = 0; i < data.itemIds.length; i++) {
				await tx
					.update(items)
					.set({ groupSortOrder: i })
					.where(and(eq(items.id, data.itemIds[i]), eq(items.groupId, data.groupId)))
			}
		})

		return { kind: 'ok' }
	})

// ===============================
// READ — groups with items for a list (used by edit page)
// ===============================

export type GroupWithItems = {
	id: number
	type: GroupType
	itemIds: number[]
}

export const getGroupsForList = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.inputValidator((data: { listId: number }) => ({ listId: data.listId }))
	.handler(async ({ data }): Promise<Array<GroupWithItems>> => {
		const groups = await db.query.itemGroups.findMany({
			where: eq(itemGroups.listId, data.listId),
		})

		const allItems = await db.query.items.findMany({
			where: and(eq(items.listId, data.listId), eq(items.isArchived, false)),
			columns: { id: true, groupId: true, groupSortOrder: true },
			orderBy: [asc(items.groupSortOrder), asc(items.id)],
		})

		return groups.map(g => ({
			id: g.id,
			type: g.type,
			itemIds: allItems.filter(i => i.groupId === g.id).map(i => i.id),
		}))
	})
