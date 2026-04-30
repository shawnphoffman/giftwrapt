import { createServerFn } from '@tanstack/react-start'
import { and, asc, count, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { z } from 'zod'

import type { SchemaDatabase } from '@/db'
import { db } from '@/db'
import { giftedItems, guardianships, itemGroups, items, listAddons, listEditors, lists, users } from '@/db/schema'
import { type BirthMonth, type GroupType, type ListType, listTypeEnumValues, type Priority } from '@/db/schema/enums'
import type { ListAddon } from '@/db/schema/lists'
import { loggingMiddleware } from '@/lib/logger'
import { canEditList, canViewList } from '@/lib/permissions'
import { authMiddleware } from '@/middleware/auth'

// Item-shaped types live with the items API. Re-exported here so existing
// imports (`@/api/lists`) keep working.
export type { GiftOnItem, ItemForEditing, ItemWithGifts, SortOption } from '@/api/items'

export type AddonOnList = Pick<
	ListAddon,
	'id' | 'listId' | 'userId' | 'description' | 'totalCost' | 'notes' | 'isArchived' | 'createdAt'
> & {
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

export const getListForViewing = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: { listId: string }) => ({
		listId: data.listId,
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

		// Items now live in their own React Query cache via getItemsForListView;
		// this fn returns just the metadata + addons + groups. Addons + groups
		// fetch in parallel.
		const [addons, viewGroups] = await Promise.all([
			db.query.listAddons.findMany({
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
			}),
			db.query.itemGroups.findMany({
				where: eq(itemGroups.listId, list.id),
				columns: { id: true, type: true, name: true, priority: true, sortOrder: true },
			}),
		])

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
				groups: viewGroups,
				addons,
			},
		}
	})

// ===============================
// READ - batched list summaries (for internal-list link resolution)
// ===============================
// Resolves a set of list ids to their display names, honoring privacy: rows
// the viewer can't see (private without grant, inactive, denied) are simply
// omitted from the response. Owners always see their own lists. Used by
// ItemRow to render a list-icon badge with the linked list's title when an
// item URL points at another list in this app.

const GetListSummariesInputSchema = z.object({
	listIds: z.array(z.number().int().positive()).max(50),
})

export type ListSummary = { id: number; name: string }

export const getListSummaries = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof GetListSummariesInputSchema>) => GetListSummariesInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<{ summaries: Array<ListSummary> }> => {
		if (data.listIds.length === 0) return { summaries: [] }

		const userId = context.session.user.id
		const rows = await db.query.lists.findMany({
			where: inArray(lists.id, data.listIds),
			columns: { id: true, name: true, ownerId: true, isPrivate: true, isActive: true },
		})

		const visible: Array<ListSummary> = []
		for (const row of rows) {
			if (row.ownerId === userId) {
				if (row.isActive) visible.push({ id: row.id, name: row.name })
				continue
			}
			const view = await canViewList(userId, row)
			if (view.ok) visible.push({ id: row.id, name: row.name })
		}
		return { summaries: visible }
	})

// ===============================
// READ - my lists (owner dashboard)
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
	giftIdeasTarget: {
		id: string
		name: string | null
		email: string
		image: string | null
	} | null
	itemCount: number
}

export type ChildListGroup = {
	childId: string
	childName: string | null
	childEmail: string
	childImage: string | null
	// Birthdates are exposed only for guardian -> child relationships.
	// Never populated for editable-list owners (other adults) - by design.
	birthMonth: BirthMonth | null
	birthDay: number | null
	birthYear: number | null
	lists: Array<MyListRow>
}

export type MyListsResult = {
	public: Array<MyListRow>
	private: Array<MyListRow>
	giftIdeas: Array<MyListRow>
	editable: Array<
		MyListRow & {
			ownerName: string | null
			ownerEmail: string
			ownerImage: string | null
			otherEditors: Array<{ name: string | null; email: string; image: string | null }>
		}
	>
	children: Array<ChildListGroup>
}

export async function getMyListsImpl(userId: string): Promise<MyListsResult> {
	// Fetch owned lists, editor-shared lists, and guardianship rows in parallel.
	// Children's actual lists need the child IDs from the guardianship rows, so
	// they fan out in a second stage below.
	const [ownedLists, editableRows, childRows] = await Promise.all([
		db
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
			.orderBy(desc(lists.isPrimary), asc(lists.name)),

		db
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
				ownerImage: sql<string | null>`owner.image`,
				itemCount: count(items.id),
			})
			.from(listEditors)
			.innerJoin(lists, and(eq(lists.id, listEditors.listId), eq(lists.isActive, true)))
			.innerJoin(sql`users as owner`, sql`owner.id = ${lists.ownerId}`)
			.leftJoin(items, and(eq(items.listId, lists.id), eq(items.isArchived, false)))
			.where(eq(listEditors.userId, userId))
			.groupBy(lists.id, sql`owner.name`, sql`owner.email`, sql`owner.image`)
			.orderBy(asc(lists.name)),

		db
			.select({
				childId: users.id,
				childName: users.name,
				childEmail: users.email,
				childImage: users.image,
				birthMonth: users.birthMonth,
				birthDay: users.birthDay,
				birthYear: users.birthYear,
			})
			.from(guardianships)
			.innerJoin(users, eq(users.id, guardianships.childUserId))
			.where(eq(guardianships.parentUserId, userId))
			.orderBy(asc(users.name)),
	])

	// Fetch every child's lists in a single query, then group by ownerId so each
	// guardianship row gets its own bucket. Avoids one query per child.
	const childIds = childRows.map(c => c.childId)
	const allChildLists = childIds.length
		? await db
				.select({
					ownerId: lists.ownerId,
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
				.where(and(inArray(lists.ownerId, childIds), eq(lists.isActive, true)))
				.groupBy(lists.id)
				.orderBy(asc(lists.name))
		: []
	const listsByChildId = new Map<string, Array<MyListRow>>()
	for (const row of allChildLists) {
		const bucket = listsByChildId.get(row.ownerId) ?? []
		bucket.push({
			id: row.id,
			name: row.name,
			type: row.type,
			isActive: row.isActive,
			isPrivate: row.isPrivate,
			isPrimary: row.isPrimary,
			description: row.description,
			giftIdeasTargetUserId: row.giftIdeasTargetUserId,
			giftIdeasTarget: null,
			itemCount: row.itemCount,
		})
		listsByChildId.set(row.ownerId, bucket)
	}

	// Fetch the other editors of every editable list (excluding the current user)
	// so the UI can render them stacked behind the owner badge.
	const editableListIds = editableRows.map(r => r.id)
	const otherEditorRows = editableListIds.length
		? await db
				.select({
					listId: listEditors.listId,
					name: users.name,
					email: users.email,
					image: users.image,
				})
				.from(listEditors)
				.innerJoin(users, eq(users.id, listEditors.userId))
				.where(and(inArray(listEditors.listId, editableListIds), ne(listEditors.userId, userId)))
				.orderBy(asc(users.name))
		: []
	const otherEditorsByListId = new Map<number, Array<{ name: string | null; email: string; image: string | null }>>()
	for (const row of otherEditorRows) {
		const bucket = otherEditorsByListId.get(row.listId) ?? []
		bucket.push({ name: row.name, email: row.email, image: row.image })
		otherEditorsByListId.set(row.listId, bucket)
	}

	// Resolve target-user details for any gift-ideas list that points at a real user.
	const targetUserIds = Array.from(
		new Set([...ownedLists, ...editableRows].map(l => l.giftIdeasTargetUserId).filter((id): id is string => Boolean(id)))
	)
	const targetUsers = targetUserIds.length
		? await db
				.select({ id: users.id, name: users.name, email: users.email, image: users.image })
				.from(users)
				.where(inArray(users.id, targetUserIds))
		: []
	const targetUserById = new Map(targetUsers.map(u => [u.id, u]))
	const resolveTarget = (id: string | null) => (id ? (targetUserById.get(id) ?? null) : null)
	const childListGroups: Array<ChildListGroup> = childRows.map(child => ({
		childId: child.childId,
		childName: child.childName,
		childEmail: child.childEmail,
		childImage: child.childImage,
		birthMonth: child.birthMonth,
		birthDay: child.birthDay,
		birthYear: child.birthYear,
		lists: listsByChildId.get(child.childId) ?? [],
	}))

	const decorateOwned = (l: (typeof ownedLists)[number]): MyListRow => ({
		id: l.id,
		name: l.name,
		type: l.type,
		isActive: l.isActive,
		isPrivate: l.isPrivate,
		isPrimary: l.isPrimary,
		description: l.description,
		giftIdeasTargetUserId: l.giftIdeasTargetUserId,
		giftIdeasTarget: resolveTarget(l.giftIdeasTargetUserId),
		itemCount: l.itemCount,
	})

	return {
		public: ownedLists.filter(l => !l.isPrivate && l.type !== 'giftideas').map(decorateOwned),
		private: ownedLists.filter(l => l.isPrivate && l.type !== 'giftideas').map(decorateOwned),
		giftIdeas: ownedLists.filter(l => l.type === 'giftideas').map(decorateOwned),
		editable: editableRows.map(r => ({
			id: r.id,
			name: r.name,
			type: r.type,
			isActive: r.isActive,
			isPrivate: r.isPrivate,
			isPrimary: r.isPrimary,
			description: r.description,
			giftIdeasTargetUserId: r.giftIdeasTargetUserId,
			giftIdeasTarget: resolveTarget(r.giftIdeasTargetUserId),
			itemCount: r.itemCount,
			ownerName: r.ownerName,
			ownerEmail: r.ownerEmail,
			ownerImage: r.ownerImage,
			otherEditors: otherEditorsByListId.get(r.id) ?? [],
		})),
		children: childListGroups,
	}
}

export const getMyLists = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(({ context }): Promise<MyListsResult> => getMyListsImpl(context.session.user.id))

// ===============================
// WRITE - create a list
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
	| { kind: 'error'; reason: 'child-cannot-create-gift-ideas' }

export const createList = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof CreateListInputSchema>) => CreateListInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<CreateListResult> => {
		const userId = context.session.user.id

		// Children can't own gift-ideas lists. See sec-review M10: was a
		// raw `throw` (HTTP 500); now a structured error so the client
		// can show a useful message instead of "Internal Server Error".
		if (data.type === 'giftideas' && context.session.user.isChild) {
			return { kind: 'error', reason: 'child-cannot-create-gift-ideas' }
		}

		// giftideas lists are always private; recipient is optional.
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
// WRITE - update a list
// ===============================

const UpdateListInputSchema = z.object({
	listId: z.number().int().positive(),
	name: z.string().min(1).max(200).optional(),
	type: z.enum(listTypeEnumValues).optional(),
	isPrivate: z.boolean().optional(),
	description: z.string().max(2000).nullable().optional(),
	isActive: z.boolean().optional(),
	giftIdeasTargetUserId: z.string().nullable().optional(),
})

export type UpdateListResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-authorized' | 'child-cannot-create-gift-ideas' }

export const updateList = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof UpdateListInputSchema>) => UpdateListInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<UpdateListResult> => {
		const userId = context.session.user.id

		const list = await db.query.lists.findFirst({
			where: eq(lists.id, data.listId),
			columns: { id: true, ownerId: true, isPrivate: true, isActive: true },
		})
		if (!list) return { kind: 'error', reason: 'not-found' }
		const isOwner = list.ownerId === userId
		if (!isOwner) {
			const edit = await canEditList(userId, list)
			if (!edit.ok) return { kind: 'error', reason: 'not-authorized' }
		}

		// See sec-review M10: was a raw `throw` (HTTP 500); now a
		// structured error so the client can show a useful message.
		if (data.type === 'giftideas' && context.session.user.isChild) {
			return { kind: 'error', reason: 'child-cannot-create-gift-ideas' }
		}

		const updates: Record<string, unknown> = {}
		if (data.name !== undefined) updates.name = data.name
		if (data.type !== undefined) updates.type = data.type
		if (data.isPrivate !== undefined) updates.isPrivate = data.isPrivate
		if (data.description !== undefined) updates.description = data.description
		if (data.isActive !== undefined) updates.isActive = data.isActive
		// Only the list owner can change the gift-ideas recipient. Non-owner editors
		// have full edit rights otherwise, but the recipient is the owner's call.
		if (data.giftIdeasTargetUserId !== undefined && isOwner) updates.giftIdeasTargetUserId = data.giftIdeasTargetUserId

		// Gift ideas lists are always private; clear the recipient if the type changes away.
		const nextType = data.type ?? undefined
		if (nextType === 'giftideas') {
			updates.isPrivate = true
		} else if (nextType !== undefined) {
			updates.giftIdeasTargetUserId = null
		}

		if (Object.keys(updates).length > 0) {
			await db.update(lists).set(updates).where(eq(lists.id, data.listId))
		}

		return { kind: 'ok' }
	})

// ===============================
// WRITE - delete a list
// ===============================
// If the list has active claims (gifted items), we force-archive instead of
// hard deleting. This preserves gift history for purchase summaries.

const DeleteListInputSchema = z.object({
	listId: z.number().int().positive(),
})

export type DeleteListResult = { kind: 'ok'; action: 'deleted' | 'archived' } | { kind: 'error'; reason: 'not-found' | 'not-owner' }

export async function deleteListImpl(args: {
	db: SchemaDatabase
	actor: { id: string }
	input: { listId: number }
}): Promise<DeleteListResult> {
	const { db: dbx, actor, input } = args

	const list = await dbx.query.lists.findFirst({
		where: eq(lists.id, input.listId),
		columns: { id: true, ownerId: true },
	})
	if (!list) return { kind: 'error', reason: 'not-found' }
	if (list.ownerId !== actor.id) return { kind: 'error', reason: 'not-owner' }

	// Check for active claims on any items in this list.
	const listItemIds = await dbx.select({ id: items.id }).from(items).where(eq(items.listId, input.listId))

	let hasClaims = false
	if (listItemIds.length > 0) {
		const claimCount = await dbx
			.select({ cnt: count() })
			.from(giftedItems)
			.where(
				inArray(
					giftedItems.itemId,
					listItemIds.map(i => i.id)
				)
			)
		hasClaims = (claimCount[0]?.cnt ?? 0) > 0
	}

	if (hasClaims) {
		// Force archive instead of delete - preserve gift history.
		await dbx.update(lists).set({ isActive: false }).where(eq(lists.id, input.listId))
		return { kind: 'ok', action: 'archived' }
	}

	// No claims - safe to hard delete. FK cascades handle items.
	await dbx.delete(lists).where(eq(lists.id, input.listId))
	return { kind: 'ok', action: 'deleted' }
}

export const deleteList = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof DeleteListInputSchema>) => DeleteListInputSchema.parse(data))
	.handler(({ context, data }) =>
		deleteListImpl({
			db,
			actor: { id: context.session.user.id },
			input: data,
		})
	)

// ===============================
// WRITE - set/unset primary list
// ===============================

const SetPrimaryListInputSchema = z.object({
	listId: z.number().int().positive(),
	isPrimary: z.boolean(),
})

export type SetPrimaryListResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-owner' | 'invalid-type' }

export const setPrimaryList = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
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
// READ - list for editing (owner/editor view)
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
	giftIdeasTargetUserId: string | null
	groups: Array<GroupSummary>
	isOwner: boolean
}

export type GetListForEditingResult = { kind: 'ok'; list: ListForEditing } | { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export const getListForEditing = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: { listId: string }) => ({
		listId: data.listId,
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
				giftIdeasTargetUserId: true,
			},
		})
		if (!list) return { kind: 'error', reason: 'not-found' }

		const isOwner = list.ownerId === userId

		// Non-owners need edit permission.
		if (!isOwner) {
			const edit = await canEditList(userId, list)
			if (!edit.ok) return { kind: 'error', reason: 'not-authorized' }
		}

		// Items live in their own React Query cache (getItemsForListEdit). This
		// fn returns just the metadata + groups.
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
				giftIdeasTargetUserId: list.giftIdeasTargetUserId,
				groups,
				isOwner,
			},
		}
	})
