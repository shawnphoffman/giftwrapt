// Server-only list implementations. Lives in a separate file from
// `lists.ts` so server-only side-effecting imports stay out of the
// client bundle. `lists.ts` only references these from inside server-fn
// handler / inputValidator bodies, which TanStack Start strips on the
// client.

import { and, arrayOverlaps, asc, count, desc, eq, inArray, max, ne, or, sql } from 'drizzle-orm'
import { z } from 'zod'

import type { SchemaDatabase } from '@/db'
import { db } from '@/db'
import { giftedItems, guardianships, itemGroups, items, listAddons, listEditors, lists, users } from '@/db/schema'
import { type BirthMonth, type GroupType, type ListType, listTypeEnumValues, type Priority } from '@/db/schema/enums'
import type { ListAddon } from '@/db/schema/lists'
import { computeListItemCounts } from '@/lib/gifts'
import { canEditList, canViewList } from '@/lib/permissions'

// =====================================================================
// Public types
// =====================================================================

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

export type GroupSummary = {
	id: number
	type: GroupType
	name: string | null
	priority: Priority
	sortOrder: number | null
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

export type ListSummary = { id: number; name: string }

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
	birthMonth: BirthMonth | null
	birthDay: number | null
	birthYear: number | null
	lastGiftedAt: Date | null
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

export type PublicListType = Exclude<ListType, 'giftideas'>

export type PublicList = {
	id: number
	name: string
	type: PublicListType
	description: string | null
	isPrimary: boolean
	itemsTotal: number
	itemsRemaining: number
	createdAt: string
	updatedAt: string
}

export type PublicUser = {
	id: string
	name: string | null
	email: string
	image: string | null
	birthMonth: BirthMonth | null
	birthDay: number | null
	partnerId: string | null
	lastGiftedAt: string | null
	lists: Array<PublicList>
}

export type CreateListResult =
	| { kind: 'ok'; list: { id: number; name: string; type: ListType } }
	| { kind: 'error'; reason: 'child-cannot-create-gift-ideas' }

export type UpdateListResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-authorized' | 'child-cannot-create-gift-ideas' }

export type DeleteListResult = { kind: 'ok'; action: 'deleted' | 'archived' } | { kind: 'error'; reason: 'not-found' | 'not-owner' }

export type SetPrimaryListResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-owner' | 'invalid-type' }

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

// =====================================================================
// Input schemas
// =====================================================================

export const GetListSummariesInputSchema = z.object({
	listIds: z.array(z.number().int().positive()).max(50),
})

export const CreateListInputSchema = z.object({
	name: z.string().min(1).max(200),
	type: z.enum(listTypeEnumValues),
	isPrivate: z.boolean().default(false),
	description: z.string().max(2000).optional(),
	giftIdeasTargetUserId: z.string().optional(),
})

export const UpdateListInputSchema = z.object({
	listId: z.number().int().positive(),
	name: z.string().min(1).max(200).optional(),
	type: z.enum(listTypeEnumValues).optional(),
	isPrivate: z.boolean().optional(),
	description: z.string().max(2000).nullable().optional(),
	isActive: z.boolean().optional(),
	giftIdeasTargetUserId: z.string().nullable().optional(),
})

export const DeleteListInputSchema = z.object({
	listId: z.number().int().positive(),
})

export const SetPrimaryListInputSchema = z.object({
	listId: z.number().int().positive(),
	isPrimary: z.boolean(),
})

// =====================================================================
// Impls
// =====================================================================

export async function getListForViewingImpl(args: { userId: string; listId: string }): Promise<GetListForViewingResult> {
	const listId = Number(args.listId)
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

	if (list.ownerId === args.userId) {
		return { kind: 'redirect', listId: String(list.id) }
	}

	const view = await canViewList(args.userId, list)
	if (!view.ok) return null

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
}

export async function getListSummariesImpl(args: {
	userId: string
	input: z.infer<typeof GetListSummariesInputSchema>
}): Promise<{ summaries: Array<ListSummary> }> {
	const { userId, input: data } = args
	if (data.listIds.length === 0) return { summaries: [] }

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
}

export async function getMyListsImpl(userId: string): Promise<MyListsResult> {
	const me = await db.query.users.findFirst({
		where: eq(users.id, userId),
		columns: { partnerId: true },
	})
	const gifterIds: Array<string> = me?.partnerId ? [userId, me.partnerId] : [userId]

	const lastGiftedSubquery = db
		.select({
			recipientOwnerId: lists.ownerId,
			lastGiftedAt: max(giftedItems.createdAt).as('lastGiftedAt'),
		})
		.from(giftedItems)
		.innerJoin(items, eq(items.id, giftedItems.itemId))
		.innerJoin(lists, eq(lists.id, items.listId))
		.where(or(inArray(giftedItems.gifterId, gifterIds), arrayOverlaps(giftedItems.additionalGifterIds, gifterIds)))
		.groupBy(lists.ownerId)
		.as('lastGifted')

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
				lastGiftedAt: lastGiftedSubquery.lastGiftedAt,
			})
			.from(guardianships)
			.innerJoin(users, eq(users.id, guardianships.childUserId))
			.leftJoin(lastGiftedSubquery, eq(lastGiftedSubquery.recipientOwnerId, users.id))
			.where(eq(guardianships.parentUserId, userId))
			.orderBy(asc(users.name)),
	])

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
		lastGiftedAt: child.lastGiftedAt,
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

export async function getPublicListsImpl(viewerUserId: string): Promise<Array<PublicUser>> {
	const deniedRelationships = await db.query.userRelationships.findMany({
		where: (rel, { and: a, eq: e }) => a(e(rel.viewerUserId, viewerUserId), e(rel.canView, false)),
		columns: { ownerUserId: true },
	})
	const deniedOwnerIds = deniedRelationships.map(rel => rel.ownerUserId)

	const me = await db.query.users.findFirst({
		where: eq(users.id, viewerUserId),
		columns: { partnerId: true },
	})
	const gifterIds: Array<string> = me?.partnerId ? [viewerUserId, me.partnerId] : [viewerUserId]

	const lastGiftedRows = await db
		.select({
			recipientId: lists.ownerId,
			lastGiftedAt: max(giftedItems.createdAt),
		})
		.from(giftedItems)
		.innerJoin(items, eq(items.id, giftedItems.itemId))
		.innerJoin(lists, eq(lists.id, items.listId))
		.where(or(inArray(giftedItems.gifterId, gifterIds), arrayOverlaps(giftedItems.additionalGifterIds, gifterIds)))
		.groupBy(lists.ownerId)
	const lastGiftedByUserId = new Map<string, Date | null>(lastGiftedRows.map(r => [r.recipientId, r.lastGiftedAt]))

	const allUsers = await db.query.users.findMany({
		where: (us, { and: a, ne: n, notInArray: nia }) =>
			deniedOwnerIds.length > 0 ? a(n(us.id, viewerUserId), nia(us.id, deniedOwnerIds)) : n(us.id, viewerUserId),
		columns: {
			id: true,
			name: true,
			email: true,
			image: true,
			birthMonth: true,
			birthDay: true,
			partnerId: true,
		},
		with: {
			lists: {
				where: (l, { and: a, eq: e, ne: n }) => a(e(l.isPrivate, false), e(l.isActive, true), n(l.type, 'giftideas')),
				orderBy: [desc(lists.isPrimary), desc(lists.createdAt)],
				columns: {
					id: true,
					name: true,
					type: true,
					description: true,
					isPrimary: true,
					createdAt: true,
					updatedAt: true,
				},
				with: {
					items: {
						with: {
							gifts: { columns: { quantity: true } },
						},
					},
				},
			},
		},
	})

	return allUsers.map(user => {
		const lastGiftedAt = lastGiftedByUserId.get(user.id) ?? null
		return {
			id: user.id,
			name: user.name,
			email: user.email,
			image: user.image,
			birthMonth: user.birthMonth,
			birthDay: user.birthDay,
			partnerId: user.partnerId ?? null,
			lastGiftedAt: lastGiftedAt instanceof Date ? lastGiftedAt.toISOString() : lastGiftedAt,
			lists: user.lists.map(list => {
				const { items: listItems, ...rest } = list
				const { total, unclaimed } = computeListItemCounts(listItems)
				return {
					id: rest.id,
					name: rest.name,
					type: rest.type as PublicListType,
					description: rest.description,
					isPrimary: rest.isPrimary,
					itemsTotal: total,
					itemsRemaining: unclaimed,
					createdAt: rest.createdAt instanceof Date ? rest.createdAt.toISOString() : rest.createdAt,
					updatedAt: rest.updatedAt instanceof Date ? rest.updatedAt.toISOString() : rest.updatedAt,
				}
			}),
		}
	})
}

export async function createListImpl(args: {
	actor: { id: string; isChild: boolean }
	input: z.infer<typeof CreateListInputSchema>
}): Promise<CreateListResult> {
	const { actor, input: data } = args

	if (data.type === 'giftideas' && actor.isChild) {
		return { kind: 'error', reason: 'child-cannot-create-gift-ideas' }
	}

	const [inserted] = await db
		.insert(lists)
		.values({
			name: data.name,
			type: data.type,
			isPrivate: data.type === 'giftideas' ? true : data.isPrivate,
			description: data.description ?? null,
			ownerId: actor.id,
			giftIdeasTargetUserId: data.type === 'giftideas' ? (data.giftIdeasTargetUserId ?? null) : null,
		})
		.returning({ id: lists.id, name: lists.name, type: lists.type })

	return { kind: 'ok', list: inserted }
}

export async function updateListImpl(args: {
	actor: { id: string; isChild: boolean }
	input: z.infer<typeof UpdateListInputSchema>
}): Promise<UpdateListResult> {
	const { actor, input: data } = args

	const list = await db.query.lists.findFirst({
		where: eq(lists.id, data.listId),
		columns: { id: true, ownerId: true, isPrivate: true, isActive: true },
	})
	if (!list) return { kind: 'error', reason: 'not-found' }
	const isOwner = list.ownerId === actor.id
	if (!isOwner) {
		const edit = await canEditList(actor.id, list)
		if (!edit.ok) return { kind: 'error', reason: 'not-authorized' }
	}

	if (data.type === 'giftideas' && actor.isChild) {
		return { kind: 'error', reason: 'child-cannot-create-gift-ideas' }
	}

	const updates: Record<string, unknown> = {}
	if (data.name !== undefined) updates.name = data.name
	if (data.type !== undefined) updates.type = data.type
	if (data.isPrivate !== undefined) updates.isPrivate = data.isPrivate
	if (data.description !== undefined) updates.description = data.description
	if (data.isActive !== undefined) updates.isActive = data.isActive
	if (data.giftIdeasTargetUserId !== undefined && isOwner) updates.giftIdeasTargetUserId = data.giftIdeasTargetUserId

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
}

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
		await dbx.update(lists).set({ isActive: false }).where(eq(lists.id, input.listId))
		return { kind: 'ok', action: 'archived' }
	}

	await dbx.delete(lists).where(eq(lists.id, input.listId))
	return { kind: 'ok', action: 'deleted' }
}

export async function setPrimaryListImpl(args: {
	actor: { id: string }
	input: z.infer<typeof SetPrimaryListInputSchema>
}): Promise<SetPrimaryListResult> {
	const { actor, input: data } = args

	const list = await db.query.lists.findFirst({
		where: eq(lists.id, data.listId),
		columns: { id: true, ownerId: true, type: true },
	})
	if (!list) return { kind: 'error', reason: 'not-found' }
	if (list.ownerId !== actor.id) return { kind: 'error', reason: 'not-owner' }
	if (list.type === 'giftideas') return { kind: 'error', reason: 'invalid-type' }

	await db.transaction(async tx => {
		if (data.isPrimary) {
			await tx
				.update(lists)
				.set({ isPrimary: false })
				.where(and(eq(lists.ownerId, actor.id), eq(lists.isPrimary, true)))
		}
		await tx.update(lists).set({ isPrimary: data.isPrimary }).where(eq(lists.id, data.listId))
	})

	return { kind: 'ok' }
}

export async function getListForEditingImpl(args: { userId: string; listId: string }): Promise<GetListForEditingResult> {
	const listId = Number(args.listId)
	if (!Number.isFinite(listId)) return { kind: 'error', reason: 'not-found' }

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

	const isOwner = list.ownerId === args.userId

	if (!isOwner) {
		const edit = await canEditList(args.userId, list)
		if (!edit.ok) return { kind: 'error', reason: 'not-authorized' }
	}

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
}
