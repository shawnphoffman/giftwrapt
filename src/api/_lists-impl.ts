// Server-only list implementations. Lives in a separate file from
// `lists.ts` so server-only side-effecting imports stay out of the
// client bundle. `lists.ts` only references these from inside server-fn
// handler / inputValidator bodies, which TanStack Start strips on the
// client.

import { and, arrayOverlaps, asc, count, desc, eq, inArray, max, ne, or, sql } from 'drizzle-orm'
import { z } from 'zod'

import type { SchemaDatabase } from '@/db'
import { db } from '@/db'
import {
	dependentGuardianships,
	dependents,
	giftedItems,
	guardianships,
	itemGroups,
	items,
	listAddons,
	listEditors,
	lists,
	users,
} from '@/db/schema'
import { type BirthMonth, type GroupType, type ListType, listTypeEnumValues, type Priority } from '@/db/schema/enums'
import type { ListAddon } from '@/db/schema/lists'
import { computeListItemCounts } from '@/lib/gifts'
import { isValidHolidayKey } from '@/lib/holidays'
import { canEditList, canViewList, getViewerAccessLevelForList } from '@/lib/permissions'
import { filterItemsForRestricted } from '@/lib/restricted-filter'

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

export type ListForViewingSubjectDependent = {
	id: string
	name: string
	image: string | null
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
	subjectDependent: ListForViewingSubjectDependent | null
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
	giftIdeasTargetDependentId: string | null
	giftIdeasTargetDependent: {
		id: string
		name: string
		image: string | null
	} | null
	subjectDependentId: string | null
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

export type DependentListGroup = {
	dependentId: string
	dependentName: string
	dependentImage: string | null
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
			// Populated when the list has a subject dependent. UI surfaces
			// (e.g. /me's "Lists I Can Edit" row) should use this in place of
			// the owner identity to put the dependent's avatar/name on the
			// row instead of the guardian who created it.
			subjectDependentName: string | null
			subjectDependentImage: string | null
			otherEditors: Array<{ name: string | null; email: string; image: string | null }>
		}
	>
	children: Array<ChildListGroup>
	dependents: Array<DependentListGroup>
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

// Dependents surfaced in the public-lists feed alongside users. Lists
// where `subjectDependentId` matches collapse into a single feed entry
// with the dependent's name/avatar (rather than the guardian-creator's).
export type PublicDependent = {
	id: string
	name: string
	image: string | null
	birthMonth: BirthMonth | null
	birthDay: number | null
	guardianIds: Array<string>
	lastGiftedAt: string | null
	lists: Array<PublicList>
}

export type CreateListResult =
	| { kind: 'ok'; list: { id: number; name: string; type: ListType } }
	| { kind: 'error'; reason: 'child-cannot-create-gift-ideas' | 'not-dependent-guardian' | 'invalid-holiday-selection' }

export type UpdateListResult =
	| { kind: 'ok' }
	| {
			kind: 'error'
			reason: 'not-found' | 'not-authorized' | 'child-cannot-create-gift-ideas' | 'not-dependent-guardian' | 'invalid-holiday-selection'
	  }

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
	subjectDependentId: string | null
	holidayCountry: string | null
	holidayKey: string | null
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
	giftIdeasTargetDependentId: z.string().optional(),
	// When set, the new list is FOR a dependent. The actor must be a
	// guardian of this dependent; the actor remains the `ownerId`.
	subjectDependentId: z.string().optional(),
	// Required when type === 'holiday'; ignored otherwise. ISO 3166-1
	// alpha-2 country code + slug from the curated allowlist in
	// src/lib/holidays.ts. The impl validates the pair against the
	// catalog before insert.
	holidayCountry: z.string().optional(),
	holidayKey: z.string().optional(),
})

export const UpdateListInputSchema = z.object({
	listId: z.number().int().positive(),
	name: z.string().min(1).max(200).optional(),
	type: z.enum(listTypeEnumValues).optional(),
	isPrivate: z.boolean().optional(),
	description: z.string().max(2000).nullable().optional(),
	isActive: z.boolean().optional(),
	giftIdeasTargetUserId: z.string().nullable().optional(),
	giftIdeasTargetDependentId: z.string().nullable().optional(),
	subjectDependentId: z.string().nullable().optional(),
	holidayCountry: z.string().nullable().optional(),
	holidayKey: z.string().nullable().optional(),
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

export async function getListForViewingImpl(args: {
	userId: string
	listId: string
	dbx?: SchemaDatabase
}): Promise<GetListForViewingResult> {
	const { dbx = db } = args
	const listId = Number(args.listId)
	if (!Number.isFinite(listId)) return null

	const list = await dbx.query.lists.findFirst({
		where: eq(lists.id, listId),
		columns: {
			id: true,
			name: true,
			type: true,
			description: true,
			isActive: true,
			isPrivate: true,
			ownerId: true,
			subjectDependentId: true,
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
			subjectDependent: {
				columns: {
					id: true,
					name: true,
					image: true,
				},
			},
		},
	})

	if (!list?.owner) return null

	// For dependent-subject lists, the owner is the guardian, not the
	// recipient - guardians shouldn't be redirected to "their own" edit
	// view because the list isn't really theirs as a recipient.
	if (list.ownerId === args.userId && !list.subjectDependentId) {
		return { kind: 'redirect', listId: String(list.id) }
	}

	const view = await canViewList(args.userId, list, dbx)
	if (!view.ok) return null

	const accessLevel = await getViewerAccessLevelForList(args.userId, list, dbx)

	const [addons, viewGroups] = await Promise.all([
		// Restricted viewers see ONLY their own addons - they can still
		// volunteer extras, and need to see what they've offered, but they
		// don't get to see other gifters' addons (same spoiler-protection
		// rationale as the item filter). The owner-side received-gifts view
		// surfaces them once revealed.
		dbx.query.listAddons.findMany({
			where:
				accessLevel === 'restricted'
					? and(eq(listAddons.listId, list.id), eq(listAddons.userId, args.userId))
					: eq(listAddons.listId, list.id),
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
		dbx.query.itemGroups.findMany({
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
			subjectDependent: list.subjectDependent
				? {
						id: list.subjectDependent.id,
						name: list.subjectDependent.name,
						image: list.subjectDependent.image,
					}
				: null,
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
		columns: { id: true, name: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
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

export async function getMyListsImpl(userId: string, dbx: SchemaDatabase = db): Promise<MyListsResult> {
	const me = await dbx.query.users.findFirst({
		where: eq(users.id, userId),
		columns: { partnerId: true },
	})
	const gifterIds: Array<string> = me?.partnerId ? [userId, me.partnerId] : [userId]

	const lastGiftedSubquery = dbx
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

	const [ownedLists, editableRows, childRows, dependentRows] = await Promise.all([
		dbx
			.select({
				id: lists.id,
				name: lists.name,
				type: lists.type,
				isActive: lists.isActive,
				isPrivate: lists.isPrivate,
				isPrimary: lists.isPrimary,
				description: lists.description,
				giftIdeasTargetUserId: lists.giftIdeasTargetUserId,
				giftIdeasTargetDependentId: lists.giftIdeasTargetDependentId,
				subjectDependentId: lists.subjectDependentId,
				itemCount: count(items.id),
			})
			.from(lists)
			// "Owned by me" excludes lists I created FOR a dependent - those
			// belong in the dependents section below, not in my personal lists.
			.leftJoin(items, and(eq(items.listId, lists.id), eq(items.isArchived, false)))
			.where(and(eq(lists.ownerId, userId), eq(lists.isActive, true), sql`${lists.subjectDependentId} IS NULL`))
			.groupBy(lists.id)
			.orderBy(desc(lists.isPrimary), asc(lists.name)),

		dbx
			.select({
				id: lists.id,
				name: lists.name,
				type: lists.type,
				isActive: lists.isActive,
				isPrivate: lists.isPrivate,
				isPrimary: lists.isPrimary,
				description: lists.description,
				giftIdeasTargetUserId: lists.giftIdeasTargetUserId,
				giftIdeasTargetDependentId: lists.giftIdeasTargetDependentId,
				subjectDependentId: lists.subjectDependentId,
				subjectDependentName: sql<string | null>`subject_dep.name`,
				subjectDependentImage: sql<string | null>`subject_dep.image`,
				ownerName: sql<string | null>`owner.name`,
				ownerEmail: sql<string>`owner.email`,
				ownerImage: sql<string | null>`owner.image`,
				itemCount: count(items.id),
			})
			.from(listEditors)
			.innerJoin(lists, and(eq(lists.id, listEditors.listId), eq(lists.isActive, true)))
			.innerJoin(sql`users as owner`, sql`owner.id = ${lists.ownerId}`)
			.leftJoin(sql`dependents as subject_dep`, sql`subject_dep.id = ${lists.subjectDependentId}`)
			.leftJoin(items, and(eq(items.listId, lists.id), eq(items.isArchived, false)))
			.where(eq(listEditors.userId, userId))
			.groupBy(lists.id, sql`owner.name`, sql`owner.email`, sql`owner.image`, sql`subject_dep.name`, sql`subject_dep.image`)
			.orderBy(asc(lists.name)),

		dbx
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

		dbx
			.select({
				dependentId: dependents.id,
				dependentName: dependents.name,
				dependentImage: dependents.image,
				birthMonth: dependents.birthMonth,
				birthDay: dependents.birthDay,
				birthYear: dependents.birthYear,
			})
			.from(dependentGuardianships)
			.innerJoin(dependents, and(eq(dependents.id, dependentGuardianships.dependentId), eq(dependents.isArchived, false)))
			.where(eq(dependentGuardianships.guardianUserId, userId))
			.orderBy(asc(dependents.name)),
	])

	const childIds = childRows.map(c => c.childId)
	const allChildLists = childIds.length
		? await dbx
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
					giftIdeasTargetDependentId: lists.giftIdeasTargetDependentId,
					subjectDependentId: lists.subjectDependentId,
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
			giftIdeasTargetDependentId: row.giftIdeasTargetDependentId,
			giftIdeasTargetDependent: null,
			subjectDependentId: row.subjectDependentId,
			itemCount: row.itemCount,
		})
		listsByChildId.set(row.ownerId, bucket)
	}

	const dependentIds = dependentRows.map(d => d.dependentId)
	const allDependentLists = dependentIds.length
		? await dbx
				.select({
					subjectDependentId: lists.subjectDependentId,
					id: lists.id,
					name: lists.name,
					type: lists.type,
					isActive: lists.isActive,
					isPrivate: lists.isPrivate,
					isPrimary: lists.isPrimary,
					description: lists.description,
					giftIdeasTargetUserId: lists.giftIdeasTargetUserId,
					giftIdeasTargetDependentId: lists.giftIdeasTargetDependentId,
					itemCount: count(items.id),
				})
				.from(lists)
				.leftJoin(items, and(eq(items.listId, lists.id), eq(items.isArchived, false)))
				.where(and(inArray(lists.subjectDependentId, dependentIds), eq(lists.isActive, true)))
				.groupBy(lists.id)
				.orderBy(asc(lists.name))
		: []
	const listsByDependentId = new Map<string, Array<MyListRow>>()
	for (const row of allDependentLists) {
		if (!row.subjectDependentId) continue
		const bucket = listsByDependentId.get(row.subjectDependentId) ?? []
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
			giftIdeasTargetDependentId: row.giftIdeasTargetDependentId,
			giftIdeasTargetDependent: null,
			subjectDependentId: row.subjectDependentId,
			itemCount: row.itemCount,
		})
		listsByDependentId.set(row.subjectDependentId, bucket)
	}

	// "Last gifted at" for dependents: most recent claim across all lists
	// where this dependent is the subject. Uses the same gifter/co-gifter
	// predicate as the user surface above.
	const dependentLastGiftedRows = dependentIds.length
		? await dbx
				.select({
					subjectDependentId: lists.subjectDependentId,
					lastGiftedAt: max(giftedItems.createdAt),
				})
				.from(giftedItems)
				.innerJoin(items, eq(items.id, giftedItems.itemId))
				.innerJoin(lists, eq(lists.id, items.listId))
				.where(
					and(
						inArray(lists.subjectDependentId, dependentIds),
						or(inArray(giftedItems.gifterId, gifterIds), arrayOverlaps(giftedItems.additionalGifterIds, gifterIds))
					)
				)
				.groupBy(lists.subjectDependentId)
		: []
	const lastGiftedByDependentId = new Map<string, Date | null>()
	for (const row of dependentLastGiftedRows) {
		if (row.subjectDependentId) lastGiftedByDependentId.set(row.subjectDependentId, row.lastGiftedAt)
	}

	const editableListIds = editableRows.map(r => r.id)
	const otherEditorRows = editableListIds.length
		? await dbx
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
		? await dbx
				.select({ id: users.id, name: users.name, email: users.email, image: users.image })
				.from(users)
				.where(inArray(users.id, targetUserIds))
		: []
	const targetUserById = new Map(targetUsers.map(u => [u.id, u]))
	const resolveTarget = (id: string | null) => (id ? (targetUserById.get(id) ?? null) : null)

	const targetDependentIds = Array.from(
		new Set([...ownedLists, ...editableRows].map(l => l.giftIdeasTargetDependentId).filter((id): id is string => Boolean(id)))
	)
	const targetDependents = targetDependentIds.length
		? await dbx
				.select({ id: dependents.id, name: dependents.name, image: dependents.image })
				.from(dependents)
				.where(inArray(dependents.id, targetDependentIds))
		: []
	const targetDependentById = new Map(targetDependents.map(d => [d.id, d]))
	const resolveTargetDependent = (id: string | null) => (id ? (targetDependentById.get(id) ?? null) : null)

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

	const dependentListGroups: Array<DependentListGroup> = dependentRows.map(d => ({
		dependentId: d.dependentId,
		dependentName: d.dependentName,
		dependentImage: d.dependentImage,
		birthMonth: d.birthMonth,
		birthDay: d.birthDay,
		birthYear: d.birthYear,
		lastGiftedAt: lastGiftedByDependentId.get(d.dependentId) ?? null,
		lists: listsByDependentId.get(d.dependentId) ?? [],
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
		giftIdeasTargetDependentId: l.giftIdeasTargetDependentId,
		giftIdeasTargetDependent: resolveTargetDependent(l.giftIdeasTargetDependentId),
		subjectDependentId: l.subjectDependentId,
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
			giftIdeasTargetDependentId: r.giftIdeasTargetDependentId,
			giftIdeasTargetDependent: resolveTargetDependent(r.giftIdeasTargetDependentId),
			subjectDependentId: r.subjectDependentId,
			itemCount: r.itemCount,
			ownerName: r.ownerName,
			ownerEmail: r.ownerEmail,
			ownerImage: r.ownerImage,
			subjectDependentName: r.subjectDependentName,
			subjectDependentImage: r.subjectDependentImage,
			otherEditors: otherEditorsByListId.get(r.id) ?? [],
		})),
		children: childListGroups,
		dependents: dependentListGroups,
	}
}

export async function getPublicListsImpl(viewerUserId: string): Promise<Array<PublicUser>> {
	const deniedRelationships = await db.query.userRelationships.findMany({
		where: (rel, { and: a, eq: e }) => a(e(rel.viewerUserId, viewerUserId), e(rel.accessLevel, 'none')),
		columns: { ownerUserId: true },
	})
	const deniedOwnerIds = deniedRelationships.map(rel => rel.ownerUserId)

	// Per-owner restricted set so we can apply per-item filtering when
	// rolling up itemsRemaining/itemsTotal for the public-list view.
	const restrictedRelationships = await db.query.userRelationships.findMany({
		where: (rel, { and: a, eq: e }) => a(e(rel.viewerUserId, viewerUserId), e(rel.accessLevel, 'restricted')),
		columns: { ownerUserId: true },
	})
	const restrictedOwnerIds = new Set(restrictedRelationships.map(rel => rel.ownerUserId))

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

	const viewerPartnerId = me?.partnerId ?? null

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
			// Lists owned by this user, EXCLUDING any that are about a
			// dependent - those surface under the dependent's own feed entry,
			// not under the guardian-creator's.
			lists: {
				where: (l, { and: a, eq: e, ne: n, isNull }) =>
					a(e(l.isPrivate, false), e(l.isActive, true), n(l.type, 'giftideas'), isNull(l.subjectDependentId)),
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
					itemGroups: { columns: { id: true, type: true } },
					items: {
						columns: {
							id: true,
							isArchived: true,
							quantity: true,
							groupId: true,
							groupSortOrder: true,
						},
						with: {
							gifts: {
								columns: { gifterId: true, additionalGifterIds: true, quantity: true },
							},
						},
					},
				},
			},
		},
	})

	return allUsers.map(user => {
		const lastGiftedAt = lastGiftedByUserId.get(user.id) ?? null
		const isRestrictedHere = restrictedOwnerIds.has(user.id)
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
				const { items: listItems, itemGroups: listGroups, ...rest } = list
				const visibleItems = isRestrictedHere
					? filterItemsForRestricted(
							listItems.filter(i => !i.isArchived),
							listGroups,
							viewerUserId,
							viewerPartnerId
						)
					: listItems
				const { total, unclaimed } = computeListItemCounts(visibleItems)
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

// Mirror of getPublicListsImpl for dependent recipients. Lists where
// `subjectDependentId IS NOT NULL` are grouped by their subject so that
// a dependent appears as a single feed entry, not under each guardian
// who happened to author one of their lists.
export async function getPublicDependentsImpl(viewerUserId: string): Promise<Array<PublicDependent>> {
	const me = await db.query.users.findFirst({
		where: eq(users.id, viewerUserId),
		columns: { partnerId: true },
	})
	const gifterIds: Array<string> = me?.partnerId ? [viewerUserId, me.partnerId] : [viewerUserId]

	// "Last gifted" per dependent (any list with that subjectDependentId).
	const lastGiftedRows = await db
		.select({
			subjectDependentId: lists.subjectDependentId,
			lastGiftedAt: max(giftedItems.createdAt),
		})
		.from(giftedItems)
		.innerJoin(items, eq(items.id, giftedItems.itemId))
		.innerJoin(lists, eq(lists.id, items.listId))
		.where(or(inArray(giftedItems.gifterId, gifterIds), arrayOverlaps(giftedItems.additionalGifterIds, gifterIds)))
		.groupBy(lists.subjectDependentId)
	const lastGiftedByDependentId = new Map<string, Date | null>()
	for (const row of lastGiftedRows) {
		if (row.subjectDependentId) lastGiftedByDependentId.set(row.subjectDependentId, row.lastGiftedAt)
	}

	const allDependents = await db.query.dependents.findMany({
		where: eq(dependents.isArchived, false),
		columns: {
			id: true,
			name: true,
			image: true,
			birthMonth: true,
			birthDay: true,
		},
		with: {
			guardianships: {
				columns: { guardianUserId: true },
			},
			// All non-private, non-giftideas active lists owned-by-subject for this dependent.
		},
	})

	if (allDependents.length === 0) return []

	const dependentIds = allDependents.map(d => d.id)
	const dependentLists = await db.query.lists.findMany({
		where: (l, { and: a, eq: e, ne: n, isNotNull: nn, inArray: ia }) =>
			a(
				e(l.isPrivate, false),
				e(l.isActive, true),
				n(l.type, 'giftideas'),
				nn(l.subjectDependentId),
				ia(l.subjectDependentId, dependentIds)
			),
		orderBy: [desc(lists.isPrimary), desc(lists.createdAt)],
		columns: {
			id: true,
			name: true,
			type: true,
			description: true,
			isPrimary: true,
			subjectDependentId: true,
			createdAt: true,
			updatedAt: true,
		},
		with: {
			items: {
				columns: { id: true, isArchived: true, quantity: true, groupId: true, groupSortOrder: true },
				with: {
					gifts: { columns: { gifterId: true, additionalGifterIds: true, quantity: true } },
				},
			},
			itemGroups: { columns: { id: true, type: true } },
		},
	})

	const listsByDependentId = new Map<string, Array<PublicList>>()
	for (const list of dependentLists) {
		if (!list.subjectDependentId) continue
		const visibleItems = list.items.filter(i => !i.isArchived)
		const { total, unclaimed } = computeListItemCounts(visibleItems)
		const bucket = listsByDependentId.get(list.subjectDependentId) ?? []
		bucket.push({
			id: list.id,
			name: list.name,
			type: list.type as PublicListType,
			description: list.description,
			isPrimary: list.isPrimary,
			itemsTotal: total,
			itemsRemaining: unclaimed,
			createdAt: list.createdAt instanceof Date ? list.createdAt.toISOString() : list.createdAt,
			updatedAt: list.updatedAt instanceof Date ? list.updatedAt.toISOString() : list.updatedAt,
		})
		listsByDependentId.set(list.subjectDependentId, bucket)
	}

	return allDependents
		.filter(d => (listsByDependentId.get(d.id)?.length ?? 0) > 0)
		.map(d => {
			const lastGiftedAt = lastGiftedByDependentId.get(d.id) ?? null
			return {
				id: d.id,
				name: d.name,
				image: d.image,
				birthMonth: d.birthMonth,
				birthDay: d.birthDay,
				guardianIds: d.guardianships.map(g => g.guardianUserId),
				lastGiftedAt: lastGiftedAt instanceof Date ? lastGiftedAt.toISOString() : lastGiftedAt,
				lists: listsByDependentId.get(d.id) ?? [],
			}
		})
}

// Returns the country code from the user's most recently created
// `holiday`-typed list, or null if they've never made one. Powers the
// create-list dialog's "default to last-used country" affordance, with
// the UI falling back to 'US' when this returns null.
export async function getMyLastHolidayCountryImpl(args: { userId: string; dbx?: SchemaDatabase }): Promise<string | null> {
	const dbx = args.dbx ?? db
	const row = await dbx.query.lists.findFirst({
		where: and(eq(lists.ownerId, args.userId), eq(lists.type, 'holiday')),
		columns: { holidayCountry: true },
		orderBy: [desc(lists.createdAt)],
	})
	return row?.holidayCountry ?? null
}

export async function createListImpl(args: {
	actor: { id: string; isChild: boolean }
	input: z.infer<typeof CreateListInputSchema>
}): Promise<CreateListResult> {
	const { actor, input: data } = args

	if (data.type === 'giftideas' && actor.isChild) {
		return { kind: 'error', reason: 'child-cannot-create-gift-ideas' }
	}

	// If a subject-dependent is requested, the actor must be one of its
	// guardians. Children can't be guardians (enforced elsewhere) so the
	// child-create rule above is sufficient on the role side.
	if (data.subjectDependentId) {
		const guard = await db.query.dependentGuardianships.findFirst({
			where: and(eq(dependentGuardianships.guardianUserId, actor.id), eq(dependentGuardianships.dependentId, data.subjectDependentId)),
			columns: { guardianUserId: true },
		})
		if (!guard) return { kind: 'error', reason: 'not-dependent-guardian' }
	}

	// Resolve the gift-ideas target. Exactly one of user / dependent may be
	// set; both null is valid (a generic gift-ideas list with no pinned
	// recipient).
	const giftIdeasTargetUserId = data.type === 'giftideas' ? (data.giftIdeasTargetUserId ?? null) : null
	const giftIdeasTargetDependentId = data.type === 'giftideas' ? (data.giftIdeasTargetDependentId ?? null) : null

	// Holiday metadata: required + validated when type === 'holiday'; null
	// otherwise so a switch back to a non-holiday type doesn't carry
	// stale country/key values.
	let holidayCountry: string | null = null
	let holidayKey: string | null = null
	if (data.type === 'holiday') {
		if (!data.holidayCountry || !data.holidayKey || !(await isValidHolidayKey(data.holidayCountry, data.holidayKey))) {
			return { kind: 'error', reason: 'invalid-holiday-selection' }
		}
		holidayCountry = data.holidayCountry
		holidayKey = data.holidayKey
	}

	const [inserted] = await db
		.insert(lists)
		.values({
			name: data.name,
			type: data.type,
			isPrivate: data.type === 'giftideas' ? true : data.isPrivate,
			description: data.description ?? null,
			ownerId: actor.id,
			subjectDependentId: data.subjectDependentId ?? null,
			giftIdeasTargetUserId,
			giftIdeasTargetDependentId,
			holidayCountry,
			holidayKey,
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
		columns: {
			id: true,
			ownerId: true,
			subjectDependentId: true,
			isPrivate: true,
			isActive: true,
			type: true,
			holidayCountry: true,
			holidayKey: true,
		},
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
	if (data.giftIdeasTargetUserId !== undefined && isOwner) {
		updates.giftIdeasTargetUserId = data.giftIdeasTargetUserId
		// Setting a user target clears the dependent target (mutually exclusive).
		if (data.giftIdeasTargetUserId) updates.giftIdeasTargetDependentId = null
	}
	if (data.giftIdeasTargetDependentId !== undefined && isOwner) {
		updates.giftIdeasTargetDependentId = data.giftIdeasTargetDependentId
		if (data.giftIdeasTargetDependentId) updates.giftIdeasTargetUserId = null
	}
	if (data.subjectDependentId !== undefined && isOwner) {
		if (data.subjectDependentId) {
			const guard = await db.query.dependentGuardianships.findFirst({
				where: and(eq(dependentGuardianships.guardianUserId, actor.id), eq(dependentGuardianships.dependentId, data.subjectDependentId)),
				columns: { guardianUserId: true },
			})
			if (!guard) return { kind: 'error', reason: 'not-dependent-guardian' }
		}
		updates.subjectDependentId = data.subjectDependentId
	}

	const nextType = data.type ?? list.type
	if (data.type === 'giftideas') {
		updates.isPrivate = true
	}
	if (data.type !== undefined && data.type !== 'giftideas') {
		updates.giftIdeasTargetUserId = null
		updates.giftIdeasTargetDependentId = null
	}

	// Holiday metadata: validate when the result will be a holiday list,
	// null when it leaves the holiday type. `lastHolidayArchiveAt` is
	// per-(list, holiday) state; null it whenever country or key
	// changes so a repurposed list never inherits stale archive
	// bookkeeping.
	if (nextType === 'holiday') {
		const country = data.holidayCountry !== undefined ? data.holidayCountry : list.holidayCountry
		const key = data.holidayKey !== undefined ? data.holidayKey : list.holidayKey
		if (!country || !key || !(await isValidHolidayKey(country, key))) {
			return { kind: 'error', reason: 'invalid-holiday-selection' }
		}
		if (data.holidayCountry !== undefined) updates.holidayCountry = country
		if (data.holidayKey !== undefined) updates.holidayKey = key
		const countryChanged = data.holidayCountry !== undefined && data.holidayCountry !== list.holidayCountry
		const keyChanged = data.holidayKey !== undefined && data.holidayKey !== list.holidayKey
		const typeJustBecameHoliday = data.type === 'holiday' && list.type !== 'holiday'
		if (countryChanged || keyChanged || typeJustBecameHoliday) {
			updates.lastHolidayArchiveAt = null
		}
	} else if (data.type !== undefined && data.type !== 'holiday') {
		// Type is changing AWAY from holiday: clear all holiday metadata.
		updates.holidayCountry = null
		updates.holidayKey = null
		updates.lastHolidayArchiveAt = null
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

export async function getListForEditingImpl(args: {
	userId: string
	listId: string
	dbx?: SchemaDatabase
}): Promise<GetListForEditingResult> {
	const { dbx = db } = args
	const listId = Number(args.listId)
	if (!Number.isFinite(listId)) return { kind: 'error', reason: 'not-found' }

	const list = await dbx.query.lists.findFirst({
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
			subjectDependentId: true,
			holidayCountry: true,
			holidayKey: true,
		},
	})
	if (!list) return { kind: 'error', reason: 'not-found' }

	const isOwner = list.ownerId === args.userId

	if (!isOwner) {
		const edit = await canEditList(args.userId, list, dbx)
		if (!edit.ok) return { kind: 'error', reason: 'not-authorized' }
	}

	const groups = await dbx.query.itemGroups.findMany({
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
			subjectDependentId: list.subjectDependentId,
			holidayCountry: list.holidayCountry,
			holidayKey: list.holidayKey,
			groups,
			isOwner,
		},
	}
}
