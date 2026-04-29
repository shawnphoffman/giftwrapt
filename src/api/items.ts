import { createServerFn } from '@tanstack/react-start'
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

import { db, type SchemaDatabase } from '@/db'
import { giftedItems, itemComments, itemGroups, items, lists } from '@/db/schema'
import { availabilityEnumValues, type ListType, type Priority, priorityEnumValues, statusEnumValues } from '@/db/schema/enums'
import type { GiftedItem } from '@/db/schema/gifts'
import type { Item } from '@/db/schema/items'
import { loggingMiddleware } from '@/lib/logger'
import { canEditList, canViewList } from '@/lib/permissions'
import { getAppSettings } from '@/lib/settings-loader'
import { cleanupImageUrls } from '@/lib/storage/cleanup'
import { mirrorRemoteImageToStorage } from '@/lib/storage/mirror'
import { getVendorFromUrl } from '@/lib/urls'
import { authMiddleware } from '@/middleware/auth'

// Returns the URL to persist on `items.imageUrl`. When the
// mirrorExternalImagesOnSave setting is on, attempts to copy the remote
// URL into our bucket; on success returns the new storage URL, on
// failure returns the original URL (best-effort, warning logged inside
// the helper). Returns the original URL untouched when the setting is
// off, the URL is missing, or it's already a storage URL.
async function maybeMirrorImageForItem(
	dbx: SchemaDatabase,
	itemId: number,
	imageUrl: string | null | undefined
): Promise<string | null | undefined> {
	if (!imageUrl) return imageUrl
	const settings = await getAppSettings(dbx)
	if (!settings.mirrorExternalImagesOnSave) return imageUrl
	const mirrored = await mirrorRemoteImageToStorage(imageUrl, itemId)
	return mirrored ?? imageUrl
}

// ===============================
// Shared types for read endpoints
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
// WRITE - create an item
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

export type CreateItemResult = { kind: 'ok'; item: Item } | { kind: 'error'; reason: 'list-not-found' | 'not-authorized' }

export async function createItemImpl(args: {
	db: SchemaDatabase
	actor: { id: string }
	input: z.output<typeof CreateItemInputSchema>
}): Promise<CreateItemResult> {
	const { db: dbx, actor, input: data } = args
	const userId = actor.id

	const list = await dbx.query.lists.findFirst({
		where: eq(lists.id, data.listId),
		columns: { id: true, ownerId: true, isPrivate: true, isActive: true },
	})
	if (!list) return { kind: 'error', reason: 'list-not-found' }

	const perm = await assertCanEditItems(userId, list)
	if (!perm.ok) return { kind: 'error', reason: 'not-authorized' }

	const url = data.url ?? null
	const vendor = url ? getVendorFromUrl(url) : null

	const [inserted] = await dbx
		.insert(items)
		.values({
			listId: data.listId,
			title: data.title,
			url,
			vendorId: vendor?.id ?? null,
			vendorSource: vendor ? 'rule' : null,
			price: data.price ?? null,
			currency: data.currency ?? null,
			notes: data.notes ?? null,
			priority: data.priority ?? 'normal',
			quantity: data.quantity ?? 1,
			imageUrl: data.imageUrl ?? null,
			groupId: data.groupId ?? null,
		})
		.returning()

	// Best-effort: mirror an external imageUrl into our bucket so the
	// item record references a URL we own. No-op when the setting is
	// off, the URL is missing, or already a storage URL. Don't bump
	// modifiedAt: matches the convention from uploadItemImage.
	const mirrored = await maybeMirrorImageForItem(dbx, inserted.id, inserted.imageUrl)
	if (mirrored && mirrored !== inserted.imageUrl) {
		const [updated] = await dbx.update(items).set({ imageUrl: mirrored }).where(eq(items.id, inserted.id)).returning()
		return { kind: 'ok', item: updated }
	}

	return { kind: 'ok', item: inserted }
}

export const createItem = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof CreateItemInputSchema>) => CreateItemInputSchema.parse(data))
	.handler(({ context, data }): Promise<CreateItemResult> => createItemImpl({ db, actor: { id: context.session.user.id }, input: data }))

// ===============================
// WRITE - copy an item to another list
// ===============================
// Clones a viewable item onto a list the user can edit. Source list only
// needs to be visible (canViewList); target list needs edit access. Group
// membership, claims, comments, archived state, and modifiedAt are reset on
// the copy. Vendor is re-derived from the URL so a 'manual' override on the
// source doesn't follow.

const CopyItemInputSchema = z.object({
	itemId: z.number().int().positive(),
	targetListId: z.number().int().positive(),
})

export type CopyItemResult = { kind: 'ok'; item: Item } | { kind: 'error'; reason: 'not-found' | 'source-not-visible' | 'not-authorized' }

export const copyItemToList = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof CopyItemInputSchema>) => CopyItemInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<CopyItemResult> => {
		const userId = context.session.user.id

		const sourceItem = await db.query.items.findFirst({
			where: eq(items.id, data.itemId),
		})
		if (!sourceItem) return { kind: 'error', reason: 'not-found' }

		const sourceList = await db.query.lists.findFirst({
			where: eq(lists.id, sourceItem.listId),
			columns: { id: true, ownerId: true, isPrivate: true, isActive: true },
		})
		if (!sourceList) return { kind: 'error', reason: 'not-found' }

		const view = await canViewList(userId, sourceList)
		if (!view.ok) return { kind: 'error', reason: 'source-not-visible' }

		const targetList = await db.query.lists.findFirst({
			where: eq(lists.id, data.targetListId),
			columns: { id: true, ownerId: true, isPrivate: true, isActive: true },
		})
		if (!targetList) return { kind: 'error', reason: 'not-found' }

		const perm = await assertCanEditItems(userId, targetList)
		if (!perm.ok) return { kind: 'error', reason: 'not-authorized' }

		const vendor = sourceItem.url ? getVendorFromUrl(sourceItem.url) : null

		// Copies preserve the source `imageUrl` as-is and intentionally do
		// not run through the mirror flow.
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

		return { kind: 'ok', item: inserted }
	})

// ===============================
// WRITE - update an item
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

export type UpdateItemResult = { kind: 'ok'; item: Item } | { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export async function updateItemImpl(args: {
	db: SchemaDatabase
	actor: { id: string }
	input: z.output<typeof UpdateItemInputSchema>
}): Promise<UpdateItemResult> {
	const { db: dbx, actor, input: data } = args
	const userId = actor.id

	const item = await dbx.query.items.findFirst({
		where: eq(items.id, data.itemId),
		columns: { id: true, listId: true, vendorSource: true, imageUrl: true },
	})
	if (!item) return { kind: 'error', reason: 'not-found' }

	const list = await dbx.query.lists.findFirst({
		where: eq(lists.id, item.listId),
		columns: { id: true, ownerId: true, isPrivate: true, isActive: true },
	})
	if (!list) return { kind: 'error', reason: 'not-found' }

	const perm = await assertCanEditItems(userId, list)
	if (!perm.ok) return { kind: 'error', reason: 'not-authorized' }

	// Mirror an external imageUrl into our bucket before writing, so
	// the row only ever sees the final URL. Returns the original on
	// any failure path.
	if (data.imageUrl !== undefined && data.imageUrl !== null) {
		const mirrored = await maybeMirrorImageForItem(dbx, item.id, data.imageUrl)
		if (mirrored !== undefined) data.imageUrl = mirrored
	}

	const priorImageUrl = item.imageUrl
	const updates: Record<string, unknown> = {}
	let bumpModifiedAt = false

	if (data.title !== undefined) {
		updates.title = data.title
		bumpModifiedAt = true
	}
	if (data.url !== undefined) {
		updates.url = data.url
		bumpModifiedAt = true
		// Vendor lifecycle:
		//  - URL cleared -> vendor cleared (any source).
		//  - URL set/changed, source != 'manual' -> re-derive as 'rule'.
		//  - URL set/changed, source == 'manual' -> leave vendor alone (user pinned it).
		if (data.url === null) {
			updates.vendorId = null
			updates.vendorSource = null
		} else if (item.vendorSource !== 'manual') {
			const vendor = getVendorFromUrl(data.url)
			updates.vendorId = vendor?.id ?? null
			updates.vendorSource = vendor ? 'rule' : null
		}
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
		const fullItem = await dbx.query.items.findFirst({ where: eq(items.id, data.itemId) })
		return { kind: 'ok', item: fullItem! }
	}

	const [updated] = await dbx.update(items).set(updates).where(eq(items.id, data.itemId)).returning()

	// If we just replaced the imageUrl with a different value, the old
	// URL is now orphaned. Best-effort cleanup matches the pattern
	// from uploadItemImage; cleanupImageUrls is a no-op for non-storage
	// URLs.
	if (data.imageUrl !== undefined && priorImageUrl && priorImageUrl !== updated.imageUrl) {
		void cleanupImageUrls([priorImageUrl])
	}

	return { kind: 'ok', item: updated }
}

export const updateItem = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof UpdateItemInputSchema>) => UpdateItemInputSchema.parse(data))
	.handler(({ context, data }): Promise<UpdateItemResult> => updateItemImpl({ db, actor: { id: context.session.user.id }, input: data }))

// ===============================
// WRITE - delete an item
// ===============================
// Hard delete. FK cascades handle claims and comments.

const DeleteItemInputSchema = z.object({
	itemId: z.number().int().positive(),
})

export type DeleteItemResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export const deleteItem = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof DeleteItemInputSchema>) => DeleteItemInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<DeleteItemResult> => {
		const userId = context.session.user.id

		const item = await db.query.items.findFirst({
			where: eq(items.id, data.itemId),
			columns: { id: true, listId: true, imageUrl: true },
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
		// Post-commit storage cleanup. Best-effort; orphans are collected
		// by the future storage-gc sweeper (TODO(storage-gc)).
		await cleanupImageUrls([item.imageUrl])
		return { kind: 'ok' }
	})

// ===============================
// WRITE - archive/unarchive an item
// ===============================

const ArchiveItemInputSchema = z.object({
	itemId: z.number().int().positive(),
	archived: z.boolean(),
})

export type ArchiveItemResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export const archiveItem = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
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
// WRITE - set item availability
// ===============================
// Toggleable by any signed-in viewer of the list (mirrors claim authz, since
// gifters are the ones who discover an item is sold out). Bumps
// availabilityChangedAt so the badge tooltip can show "Marked unavailable on…".

const SetItemAvailabilityInputSchema = z.object({
	itemId: z.number().int().positive(),
	availability: z.enum(availabilityEnumValues),
})

export type SetItemAvailabilityResult = { kind: 'ok'; item: Item } | { kind: 'error'; reason: 'not-found' | 'not-visible' }

export const setItemAvailability = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof SetItemAvailabilityInputSchema>) => SetItemAvailabilityInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<SetItemAvailabilityResult> => {
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

		const view = await canViewList(userId, list)
		if (!view.ok) return { kind: 'error', reason: 'not-visible' }

		const [updated] = await db
			.update(items)
			.set({ availability: data.availability, availabilityChangedAt: new Date() })
			.where(eq(items.id, data.itemId))
			.returning()
		return { kind: 'ok', item: updated }
	})

// ===============================
// Move helpers
// ===============================
// Cross-type moves (e.g. wishlist → todo) delete associated claims because
// spoiler protection semantics differ between list types.

/** List types that share spoiler protection semantics. */
const SPOILER_PROTECTED_TYPES: ReadonlySet<ListType> = new Set(['wishlist', 'christmas', 'birthday'])

function isCrossTypeMoveDestructive(sourceType: ListType, targetType: ListType): boolean {
	if (sourceType === targetType) return false
	// Moving between spoiler-protected types is safe.
	if (SPOILER_PROTECTED_TYPES.has(sourceType) && SPOILER_PROTECTED_TYPES.has(targetType)) return false
	return true
}

// ===============================
// BULK - shared helpers
// ===============================

const BulkIdsSchema = z.array(z.number().int().positive()).min(1).max(500)

type ItemRow = { id: number; listId: number }

/** Load items by id and assert the user can edit every source list. */
async function loadAndAuthorizeItems(
	userId: string,
	itemIds: ReadonlyArray<number>
): Promise<
	| { ok: true; rows: Array<ItemRow>; lists: Map<number, ListForPermCheck & { type: ListType }> }
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
// BULK - move items to another list
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
	.middleware([authMiddleware, loggingMiddleware])
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
// BULK - archive / unarchive
// ===============================

const ArchiveItemsInputSchema = z.object({
	itemIds: BulkIdsSchema,
	archived: z.boolean(),
})

export type ArchiveItemsResult = { kind: 'ok'; updated: number } | { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export const archiveItems = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ArchiveItemsInputSchema>) => ArchiveItemsInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<ArchiveItemsResult> => {
		const userId = context.session.user.id
		const loaded = await loadAndAuthorizeItems(userId, data.itemIds)
		if (!loaded.ok) return { kind: 'error', reason: loaded.reason }

		await db
			.update(items)
			.set({ isArchived: data.archived })
			.where(inArray(items.id, [...data.itemIds]))
		return { kind: 'ok', updated: data.itemIds.length }
	})

// ===============================
// BULK - delete
// ===============================

const DeleteItemsInputSchema = z.object({
	itemIds: BulkIdsSchema,
})

export type DeleteItemsResult = { kind: 'ok'; deleted: number } | { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export const deleteItems = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof DeleteItemsInputSchema>) => DeleteItemsInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<DeleteItemsResult> => {
		const userId = context.session.user.id
		const loaded = await loadAndAuthorizeItems(userId, data.itemIds)
		if (!loaded.ok) return { kind: 'error', reason: loaded.reason }

		// Capture imageUrls before delete for post-commit storage cleanup.
		const rows = await db.query.items.findMany({
			where: inArray(items.id, [...data.itemIds]),
			columns: { imageUrl: true },
		})

		await db.delete(items).where(inArray(items.id, [...data.itemIds]))
		await cleanupImageUrls(rows.map(r => r.imageUrl))
		return { kind: 'ok', deleted: data.itemIds.length }
	})

// ===============================
// BULK - set priority
// ===============================

const SetItemsPriorityInputSchema = z.object({
	itemIds: BulkIdsSchema,
	priority: z.enum(priorityEnumValues),
})

export type SetItemsPriorityResult = { kind: 'ok'; updated: number } | { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export const setItemsPriority = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof SetItemsPriorityInputSchema>) => SetItemsPriorityInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<SetItemsPriorityResult> => {
		const userId = context.session.user.id
		const loaded = await loadAndAuthorizeItems(userId, data.itemIds)
		if (!loaded.ok) return { kind: 'error', reason: loaded.reason }

		await db
			.update(items)
			.set({ priority: data.priority })
			.where(inArray(items.id, [...data.itemIds]))
		return { kind: 'ok', updated: data.itemIds.length }
	})

// ===============================
// BULK - reorder items across priority buckets on one list
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
			})
		)
		.min(1)
		.max(500),
})

export type ReorderItemsResult = { kind: 'ok'; updated: number } | { kind: 'error'; reason: 'not-found' | 'not-authorized' | 'mixed-lists' }

export const reorderItems = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
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

// ===============================
// BULK - reorder mixed items + groups across priority buckets
// ===============================
// Used by the Organize/Reorder UI which interleaves items and group rows
// inside the same priority buckets.

const ReorderEntriesInputSchema = z.object({
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

export type ReorderEntriesResult =
	| { kind: 'ok'; updatedItems: number; updatedGroups: number }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' | 'mixed-lists' }

export const reorderListEntries = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ReorderEntriesInputSchema>) => ReorderEntriesInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<ReorderEntriesResult> => {
		const userId = context.session.user.id

		const list = await db.query.lists.findFirst({
			where: eq(lists.id, data.listId),
			columns: { id: true, ownerId: true, isPrivate: true, isActive: true },
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
		return { kind: 'ok', updatedItems: data.items.length, updatedGroups: data.groups.length }
	})

// ===============================
// BULK - set priority on multiple groups
// ===============================

const SetGroupsPriorityInputSchema = z.object({
	groupIds: z.array(z.number().int().positive()).min(1).max(100),
	priority: z.enum(priorityEnumValues),
})

export type SetGroupsPriorityResult =
	| { kind: 'ok'; updated: number }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' | 'mixed-lists' }

export const setGroupsPriority = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof SetGroupsPriorityInputSchema>) => SetGroupsPriorityInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<SetGroupsPriorityResult> => {
		const userId = context.session.user.id

		const groupRows = await db.query.itemGroups.findMany({
			where: inArray(itemGroups.id, data.groupIds),
			columns: { id: true, listId: true },
		})
		if (groupRows.length !== data.groupIds.length) return { kind: 'error', reason: 'not-found' }
		const listIds = new Set(groupRows.map(r => r.listId))
		if (listIds.size > 1) return { kind: 'error', reason: 'mixed-lists' }

		const list = await db.query.lists.findFirst({
			where: eq(lists.id, groupRows[0].listId),
			columns: { id: true, ownerId: true, isPrivate: true, isActive: true },
		})
		if (!list) return { kind: 'error', reason: 'not-found' }
		const perm = await assertCanEditItems(userId, list)
		if (!perm.ok) return { kind: 'error', reason: 'not-authorized' }

		await db.update(itemGroups).set({ priority: data.priority }).where(inArray(itemGroups.id, data.groupIds))
		return { kind: 'ok', updated: data.groupIds.length }
	})

// ===============================
// BULK - delete multiple groups (and all their items)
// ===============================

const DeleteGroupsInputSchema = z.object({
	groupIds: z.array(z.number().int().positive()).min(1).max(100),
})

export type DeleteGroupsResult =
	| { kind: 'ok'; deletedGroups: number; deletedItems: number }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' | 'mixed-lists' }

export const deleteGroups = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof DeleteGroupsInputSchema>) => DeleteGroupsInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<DeleteGroupsResult> => {
		const userId = context.session.user.id

		const groupRows = await db.query.itemGroups.findMany({
			where: inArray(itemGroups.id, data.groupIds),
			columns: { id: true, listId: true },
		})
		if (groupRows.length !== data.groupIds.length) return { kind: 'error', reason: 'not-found' }
		const listIds = new Set(groupRows.map(r => r.listId))
		if (listIds.size > 1) return { kind: 'error', reason: 'mixed-lists' }

		const list = await db.query.lists.findFirst({
			where: eq(lists.id, groupRows[0].listId),
			columns: { id: true, ownerId: true, isPrivate: true, isActive: true },
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
		return { kind: 'ok', deletedGroups: data.groupIds.length, deletedItems: itemIds.length }
	})

// ===============================
// READ - items for a list (viewer perspective)
// ===============================
// Returns items with their gifts and a per-item comment count for non-owner
// viewers of the list. Owners are redirected by the route loader before this
// runs; defensively rejects them here too so a stale call can't leak gift
// data to the recipient.

export type GetItemsForListViewResult =
	| { kind: 'ok'; items: Array<ItemWithGifts> }
	| { kind: 'error'; reason: 'not-found' | 'not-visible' | 'is-owner' }

export const getItemsForListView = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: { listId: string; sort?: SortOption }) => ({
		listId: data.listId,
		sort: data.sort || ('priority-desc' as SortOption),
	}))
	.handler(async ({ context, data }): Promise<GetItemsForListViewResult> => {
		const listId = Number(data.listId)
		if (!Number.isFinite(listId)) return { kind: 'error', reason: 'not-found' }

		const list = await db.query.lists.findFirst({
			where: eq(lists.id, listId),
			columns: { id: true, ownerId: true, isPrivate: true, isActive: true },
		})
		if (!list) return { kind: 'error', reason: 'not-found' }

		const userId = context.session.user.id
		if (list.ownerId === userId) return { kind: 'error', reason: 'is-owner' }

		const view = await canViewList(userId, list)
		if (!view.ok) return { kind: 'error', reason: 'not-visible' }

		const [sortBy, sortOrder] = data.sort.split('-') as [string, 'asc' | 'desc']
		const orderBy = sortBy === 'priority' ? [asc(items.id)] : sortOrder === 'asc' ? [asc(items.createdAt)] : [desc(items.createdAt)]

		const [listItems, viewGroups] = await Promise.all([
			db.query.items.findMany({
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
			}),
			db.query.itemGroups.findMany({
				where: eq(itemGroups.listId, list.id),
				columns: { id: true, priority: true },
			}),
		])

		const commentCountRows = listItems.length
			? await db
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

		// Priority sort happens after the fetch because grouped items inherit
		// the group's priority. Date sort already handled at the DB level.
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
	})

// ===============================
// READ - items for a list (editor perspective)
// ===============================
// Owners and editors see items without gifts (spoiler protection) but with
// comment counts. Mirrors the visibility rules of getListForEditing so an
// independent caller hits the same gates.

export type GetItemsForListEditResult =
	| { kind: 'ok'; items: Array<ItemForEditing> }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export const getItemsForListEdit = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: { listId: string; includeArchived?: boolean }) => ({
		listId: data.listId,
		includeArchived: data.includeArchived ?? false,
	}))
	.handler(async ({ context, data }): Promise<GetItemsForListEditResult> => {
		const listId = Number(data.listId)
		if (!Number.isFinite(listId)) return { kind: 'error', reason: 'not-found' }

		const list = await db.query.lists.findFirst({
			where: eq(lists.id, listId),
			columns: { id: true, ownerId: true, isPrivate: true, isActive: true },
		})
		if (!list) return { kind: 'error', reason: 'not-found' }

		const userId = context.session.user.id
		const isOwner = list.ownerId === userId
		if (!isOwner) {
			const edit = await canEditList(userId, list)
			if (!edit.ok) return { kind: 'error', reason: 'not-authorized' }
		}

		const listItems = await db.query.items.findMany({
			where: data.includeArchived ? eq(items.listId, list.id) : and(eq(items.listId, list.id), eq(items.isArchived, false)),
			orderBy: [desc(items.createdAt)],
		})

		const commentCountRows = listItems.length
			? await db
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
	})
