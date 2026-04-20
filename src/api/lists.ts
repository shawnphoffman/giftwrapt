import { createServerFn } from '@tanstack/react-start'
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { giftedItems, guardianships, itemGroups, items, listAddons, listEditors, lists, users } from '@/db/schema'
import { type GroupType, type ListType, listTypeEnumValues, type Priority } from '@/db/schema/enums'
import type { GiftedItem } from '@/db/schema/gifts'
import type { Item } from '@/db/schema/items'
import type { ListAddon } from '@/db/schema/lists'
import { canEditList, canViewList } from '@/lib/permissions'
import { authMiddleware } from '@/middleware/auth'

export type GiftOnItem = Pick<GiftedItem, 'id' | 'itemId' | 'gifterId' | 'quantity' | 'notes' | 'totalCost' | 'additionalGifterIds' | 'createdAt'> & {
	gifter: {
		id: string
		name: string | null
		email: string
		image: string | null
	}
}

export type ItemWithGifts = Item & {
	gifts: Array<GiftOnItem>
}

export type AddonOnList = Pick<ListAddon, 'id' | 'listId' | 'userId' | 'description' | 'totalCost' | 'notes' | 'isArchived' | 'createdAt'> & {
	user: {
		id: string
		name: string | null
		email: string
		image: string | null
	}
}

export type ListForViewing = {
	id: number
	name: string
	type: ListType
	description: string | null
	owner: {
		id: string
		name: string | null
		email: string
		image: string | null
	}
	items: Array<ItemWithGifts>
	groups: Array<GroupSummary>
	addons: Array<AddonOnList>
}

export type GetListForViewingResult =
	| {
			kind: 'ok'
			list: ListForViewing
	  }
	| {
			kind: 'redirect'
			listId: string
	  }
	| null

export type SortOption = 'priority-asc' | 'priority-desc' | 'date-asc' | 'date-desc'

export const getListForViewing = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.inputValidator((data: { listId: string; sort?: SortOption }) => ({
		listId: data.listId,
		sort: data.sort || ('priority-desc' as SortOption),
	}))
	.handler(async ({ context, data }): Promise<GetListForViewingResult> => {
		const listId = Number(data.listId)
		if (!Number.isFinite(listId)) return null

		const list = await db.query.lists.findFirst({
			where: eq(lists.id, listId),
			columns: {
				id: true,
				name: true,
				type: true,
				description: true,
				isActive: true,
				isPrivate: true,
				ownerId: true,
			},
			with: {
				owner: {
					columns: {
						id: true,
						name: true,
						email: true,
						image: true,
					},
				},
			},
		})

		if (!list?.owner) return null

		const currentUserId = context.session.user.id
		if (list.ownerId === currentUserId) {
			return { kind: 'redirect', listId: String(list.id) }
		}

		// Owner-agnostic visibility: inactive / private / explicitly-denied all
		// collapse to null so nothing leaks about list existence.
		const view = await canViewList(currentUserId, list)
		if (!view.ok) return null

		// Determine sort order based on sort parameter. inputValidator defaults
		// data.sort to 'priority-desc' already, so no fallback needed here.
		const [sortBy, sortOrder] = data.sort.split('-') as [string, 'asc' | 'desc']

		// Priority sorting happens after the fetch because an item's effective
		// priority may come from its group. Date sorting stays at the DB level.
		const orderBy =
			sortBy === 'priority'
				? [asc(items.id)]
				: sortOrder === 'asc'
					? [asc(items.createdAt)]
					: [desc(items.createdAt)]

		// Fetch items + their gifts in one round-trip. Visibility is already
		// established above, so every claim on these items is OK to show to
		// this viewer. Gifts have no archive concept (claims are hard-deleted
		// on retraction), so no filter is needed on the gifts side.
		const listItems = await db.query.items.findMany({
			where: and(eq(items.listId, list.id), eq(items.isArchived, false)),
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
		})

		// Fetch addons (off-list gifts) for this list. Non-archived addons are
		// active; archived ones mean "gift was given" and surface on the
		// recipient's received-gifts page. We fetch both here so the UI can
		// differentiate, but the list-detail section only shows non-archived.
		const addons = await db.query.listAddons.findMany({
			where: eq(listAddons.listId, list.id),
			columns: {
				id: true,
				listId: true,
				userId: true,
				description: true,
				totalCost: true,
				notes: true,
				isArchived: true,
				createdAt: true,
			},
			with: {
				user: {
					columns: { id: true, name: true, email: true, image: true },
				},
			},
			orderBy: [desc(listAddons.createdAt)],
		})

		const viewGroups = await db.query.itemGroups.findMany({
			where: eq(itemGroups.listId, list.id),
			columns: { id: true, type: true, name: true, priority: true, sortOrder: true },
		})

		// Priority-sort after fetch so items in a group inherit the group's
		// priority (single source of truth; item.priority is ignored while
		// the item belongs to a group).
		let sortedItems = listItems
		if (sortBy === 'priority') {
			const rank: Record<Priority, number> = { 'very-high': 4, high: 3, normal: 2, low: 1 }
			const groupPriorityById = new Map(viewGroups.map(g => [g.id, g.priority]))
			const effective = (i: (typeof listItems)[number]) =>
				(i.groupId !== null ? groupPriorityById.get(i.groupId) : undefined) ?? i.priority
			sortedItems = [...listItems].sort((a, b) => {
				const diff = rank[effective(a)] - rank[effective(b)]
				if (diff !== 0) return sortOrder === 'asc' ? diff : -diff
				return a.id - b.id
			})
		}

		return {
			kind: 'ok',
			list: {
				id: list.id,
				name: list.name,
				type: list.type,
				description: list.description,
				owner: {
					id: list.owner.id,
					name: list.owner.name,
					email: list.owner.email,
					image: list.owner.image,
				},
				items: sortedItems,
				groups: viewGroups,
				addons,
			},
		}
	})

// ===============================
// READ — my lists (owner dashboard)
// ===============================

export type MyListRow = {
	id: number
	name: string
	type: ListType
	isActive: boolean
	isPrivate: boolean
	isPrimary: boolean
	description: string | null
	giftIdeasTargetUserId: string | null
	itemCount: number
}

export type ChildListGroup = {
	childId: string
	childName: string | null
	childEmail: string
	childImage: string | null
	lists: Array<MyListRow>
}

export type MyListsResult = {
	public: Array<MyListRow>
	private: Array<MyListRow>
	giftIdeas: Array<MyListRow>
	editable: Array<MyListRow & { ownerName: string | null; ownerEmail: string }>
	children: Array<ChildListGroup>
}

export const getMyLists = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.handler(async ({ context }): Promise<MyListsResult> => {
		const userId = context.session.user.id

		// Fetch all owned active lists with item counts in one query.
		const ownedLists = await db
			.select({
				id: lists.id,
				name: lists.name,
				type: lists.type,
				isActive: lists.isActive,
				isPrivate: lists.isPrivate,
				isPrimary: lists.isPrimary,
				description: lists.description,
				giftIdeasTargetUserId: lists.giftIdeasTargetUserId,
				itemCount: count(items.id),
			})
			.from(lists)
			.leftJoin(items, and(eq(items.listId, lists.id), eq(items.isArchived, false)))
			.where(and(eq(lists.ownerId, userId), eq(lists.isActive, true)))
			.groupBy(lists.id)
			.orderBy(desc(lists.isPrimary), asc(lists.name))

		// Fetch lists where user is an editor (via listEditors table).
		const editableRows = await db
			.select({
				id: lists.id,
				name: lists.name,
				type: lists.type,
				isActive: lists.isActive,
				isPrivate: lists.isPrivate,
				isPrimary: lists.isPrimary,
				description: lists.description,
				giftIdeasTargetUserId: lists.giftIdeasTargetUserId,
				ownerName: sql<string | null>`owner.name`,
				ownerEmail: sql<string>`owner.email`,
				itemCount: count(items.id),
			})
			.from(listEditors)
			.innerJoin(lists, and(eq(lists.id, listEditors.listId), eq(lists.isActive, true)))
			.innerJoin(sql`users as owner`, sql`owner.id = ${lists.ownerId}`)
			.leftJoin(items, and(eq(items.listId, lists.id), eq(items.isArchived, false)))
			.where(eq(listEditors.userId, userId))
			.groupBy(lists.id, sql`owner.name`, sql`owner.email`)
			.orderBy(asc(lists.name))

		// Fetch children's lists (guardianship).
		const childRows = await db
			.select({
				childId: users.id,
				childName: users.name,
				childEmail: users.email,
				childImage: users.image,
			})
			.from(guardianships)
			.innerJoin(users, eq(users.id, guardianships.childUserId))
			.where(eq(guardianships.parentUserId, userId))
			.orderBy(asc(users.name))

		const childListGroups: Array<ChildListGroup> = []
		for (const child of childRows) {
			const childLists = await db
				.select({
					id: lists.id,
					name: lists.name,
					type: lists.type,
					isActive: lists.isActive,
					isPrivate: lists.isPrivate,
					isPrimary: lists.isPrimary,
					description: lists.description,
					giftIdeasTargetUserId: lists.giftIdeasTargetUserId,
					itemCount: count(items.id),
				})
				.from(lists)
				.leftJoin(items, and(eq(items.listId, lists.id), eq(items.isArchived, false)))
				.where(and(eq(lists.ownerId, child.childId), eq(lists.isActive, true)))
				.groupBy(lists.id)
				.orderBy(asc(lists.name))

			childListGroups.push({
				childId: child.childId,
				childName: child.childName,
				childEmail: child.childEmail,
				childImage: child.childImage,
				lists: childLists,
			})
		}

		return {
			public: ownedLists.filter(l => !l.isPrivate && l.type !== 'giftideas'),
			private: ownedLists.filter(l => l.isPrivate && l.type !== 'giftideas'),
			giftIdeas: ownedLists.filter(l => l.type === 'giftideas'),
			editable: editableRows.map(r => ({
				id: r.id,
				name: r.name,
				type: r.type,
				isActive: r.isActive,
				isPrivate: r.isPrivate,
				isPrimary: r.isPrimary,
				description: r.description,
				giftIdeasTargetUserId: r.giftIdeasTargetUserId,
				itemCount: r.itemCount,
				ownerName: r.ownerName,
				ownerEmail: r.ownerEmail,
			})),
			children: childListGroups,
		}
	})

// ===============================
// WRITE — create a list
// ===============================

const CreateListInputSchema = z.object({
	name: z.string().min(1).max(200),
	type: z.enum(listTypeEnumValues),
	isPrivate: z.boolean().default(false),
	description: z.string().max(2000).optional(),
	giftIdeasTargetUserId: z.string().optional(),
})

export type CreateListResult =
	| { kind: 'ok'; list: { id: number; name: string; type: ListType } }
	| { kind: 'error'; reason: 'target-required' }

export const createList = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.input<typeof CreateListInputSchema>) => CreateListInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<CreateListResult> => {
		const userId = context.session.user.id

		// giftideas lists must have a target user and are always private.
		if (data.type === 'giftideas' && !data.giftIdeasTargetUserId) {
			return { kind: 'error', reason: 'target-required' }
		}

		const [inserted] = await db
			.insert(lists)
			.values({
				name: data.name,
				type: data.type,
				isPrivate: data.type === 'giftideas' ? true : data.isPrivate,
				description: data.description ?? null,
				ownerId: userId,
				giftIdeasTargetUserId: data.type === 'giftideas' ? (data.giftIdeasTargetUserId ?? null) : null,
			})
			.returning({ id: lists.id, name: lists.name, type: lists.type })

		return { kind: 'ok', list: inserted }
	})

// ===============================
// WRITE — update a list
// ===============================

const UpdateListInputSchema = z.object({
	listId: z.number().int().positive(),
	name: z.string().min(1).max(200).optional(),
	type: z.enum(listTypeEnumValues).optional(),
	isPrivate: z.boolean().optional(),
	description: z.string().max(2000).nullable().optional(),
	isActive: z.boolean().optional(),
})

export type UpdateListResult =
	| { kind: 'ok' }
	| { kind: 'error'; reason: 'not-found' | 'not-owner' }

export const updateList = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.input<typeof UpdateListInputSchema>) => UpdateListInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<UpdateListResult> => {
		const userId = context.session.user.id

		const list = await db.query.lists.findFirst({
			where: eq(lists.id, data.listId),
			columns: { id: true, ownerId: true },
		})
		if (!list) return { kind: 'error', reason: 'not-found' }
		if (list.ownerId !== userId) return { kind: 'error', reason: 'not-owner' }

		const updates: Record<string, unknown> = {}
		if (data.name !== undefined) updates.name = data.name
		if (data.type !== undefined) updates.type = data.type
		if (data.isPrivate !== undefined) updates.isPrivate = data.isPrivate
		if (data.description !== undefined) updates.description = data.description
		if (data.isActive !== undefined) updates.isActive = data.isActive

		if (Object.keys(updates).length > 0) {
			await db.update(lists).set(updates).where(eq(lists.id, data.listId))
		}

		return { kind: 'ok' }
	})

// ===============================
// WRITE — delete a list
// ===============================
// If the list has active claims (gifted items), we force-archive instead of
// hard deleting. This preserves gift history for purchase summaries.

const DeleteListInputSchema = z.object({
	listId: z.number().int().positive(),
})

export type DeleteListResult =
	| { kind: 'ok'; action: 'deleted' | 'archived' }
	| { kind: 'error'; reason: 'not-found' | 'not-owner' }

export const deleteList = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.input<typeof DeleteListInputSchema>) => DeleteListInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<DeleteListResult> => {
		const userId = context.session.user.id

		const list = await db.query.lists.findFirst({
			where: eq(lists.id, data.listId),
			columns: { id: true, ownerId: true },
		})
		if (!list) return { kind: 'error', reason: 'not-found' }
		if (list.ownerId !== userId) return { kind: 'error', reason: 'not-owner' }

		// Check for active claims on any items in this list.
		const listItemIds = await db
			.select({ id: items.id })
			.from(items)
			.where(eq(items.listId, data.listId))

		let hasClaims = false
		if (listItemIds.length > 0) {
			const claimCount = await db
				.select({ cnt: count() })
				.from(giftedItems)
				.where(inArray(giftedItems.itemId, listItemIds.map(i => i.id)))
			hasClaims = (claimCount[0]?.cnt ?? 0) > 0
		}

		if (hasClaims) {
			// Force archive instead of delete — preserve gift history.
			await db.update(lists).set({ isActive: false }).where(eq(lists.id, data.listId))
			return { kind: 'ok', action: 'archived' }
		}

		// No claims — safe to hard delete. FK cascades handle items.
		await db.delete(lists).where(eq(lists.id, data.listId))
		return { kind: 'ok', action: 'deleted' }
	})

// ===============================
// WRITE — set/unset primary list
// ===============================

const SetPrimaryListInputSchema = z.object({
	listId: z.number().int().positive(),
	isPrimary: z.boolean(),
})

export type SetPrimaryListResult =
	| { kind: 'ok' }
	| { kind: 'error'; reason: 'not-found' | 'not-owner' | 'invalid-type' }

export const setPrimaryList = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.input<typeof SetPrimaryListInputSchema>) => SetPrimaryListInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<SetPrimaryListResult> => {
		const userId = context.session.user.id

		const list = await db.query.lists.findFirst({
			where: eq(lists.id, data.listId),
			columns: { id: true, ownerId: true, type: true },
		})
		if (!list) return { kind: 'error', reason: 'not-found' }
		if (list.ownerId !== userId) return { kind: 'error', reason: 'not-owner' }
		if (list.type === 'giftideas') return { kind: 'error', reason: 'invalid-type' }

		await db.transaction(async tx => {
			// Unset any existing primary for this user.
			if (data.isPrimary) {
				await tx
					.update(lists)
					.set({ isPrimary: false })
					.where(and(eq(lists.ownerId, userId), eq(lists.isPrimary, true)))
			}
			// Set/unset the target.
			await tx.update(lists).set({ isPrimary: data.isPrimary }).where(eq(lists.id, data.listId))
		})

		return { kind: 'ok' }
	})

// ===============================
// READ — list for editing (owner/editor view)
// ===============================

export type GroupSummary = {
	id: number
	type: GroupType
	name: string | null
	priority: Priority
	sortOrder: number | null
}

export type ListForEditing = {
	id: number
	name: string
	type: ListType
	isActive: boolean
	isPrivate: boolean
	isPrimary: boolean
	description: string | null
	ownerId: string
	items: Array<Item>
	groups: Array<GroupSummary>
	isOwner: boolean
}

export type GetListForEditingResult =
	| { kind: 'ok'; list: ListForEditing }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export const getListForEditing = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.inputValidator((data: { listId: string; includeArchived?: boolean }) => ({
		listId: data.listId,
		includeArchived: data.includeArchived ?? false,
	}))
	.handler(async ({ context, data }): Promise<GetListForEditingResult> => {
		const listId = Number(data.listId)
		if (!Number.isFinite(listId)) return { kind: 'error', reason: 'not-found' }

		const userId = context.session.user.id

		const list = await db.query.lists.findFirst({
			where: eq(lists.id, listId),
			columns: {
				id: true,
				name: true,
				type: true,
				isActive: true,
				isPrivate: true,
				isPrimary: true,
				description: true,
				ownerId: true,
			},
		})
		if (!list) return { kind: 'error', reason: 'not-found' }

		const isOwner = list.ownerId === userId

		// Non-owners need edit permission.
		if (!isOwner) {
			const edit = await canEditList(userId, list)
			if (!edit.ok) return { kind: 'error', reason: 'not-authorized' }
		}

		// Archived items are hidden from the edit view by default; the organize
		// view opts in to seeing them so users can bulk-unarchive.
		const listItems = await db.query.items.findMany({
			where: data.includeArchived
				? eq(items.listId, list.id)
				: and(eq(items.listId, list.id), eq(items.isArchived, false)),
			orderBy: [desc(items.createdAt)],
		})

		const groups = await db.query.itemGroups.findMany({
			where: eq(itemGroups.listId, list.id),
			columns: { id: true, type: true, name: true, priority: true, sortOrder: true },
		})

		return {
			kind: 'ok',
			list: {
				id: list.id,
				name: list.name,
				type: list.type,
				isActive: list.isActive,
				isPrivate: list.isPrivate,
				isPrimary: list.isPrimary,
				description: list.description,
				ownerId: list.ownerId,
				items: listItems,
				groups,
				isOwner,
			},
		}
	})
