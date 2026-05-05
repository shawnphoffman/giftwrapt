// Server-only item create/update implementations. Extracted out of
// `items.ts` so the client bundle never sees the static import chain
// into `@/lib/settings-loader` -> `@/lib/crypto/app-secret` ->
// `node:crypto`. items.ts references these only from inside server-fn
// handler bodies, which TanStack Start strips when building the
// client environment, letting Rollup tree-shake this whole file out
// of the client bundle.

import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { type SchemaDatabase } from '@/db'
import { items, lists } from '@/db/schema'
import { priorityEnumValues, statusEnumValues } from '@/db/schema/enums'
import type { Item } from '@/db/schema/items'
import { httpsUpgradeOrNull } from '@/lib/image-url'
import { canEditList } from '@/lib/permissions'
import { loadCachedScrapeRating } from '@/lib/scrapers/cache'
import { getAppSettings } from '@/lib/settings-loader'
import { cleanupImageUrls } from '@/lib/storage/cleanup'
import { mirrorRemoteImageToStorage } from '@/lib/storage/mirror'
import { getVendorFromUrl } from '@/lib/urls'

type ListForPermCheck = { id: number; ownerId: string; subjectDependentId: string | null; isPrivate: boolean; isActive: boolean }

async function assertCanEditItems(userId: string, list: ListForPermCheck): Promise<{ ok: true } | { ok: false; reason: 'not-authorized' }> {
	if (list.ownerId === userId) return { ok: true }
	const edit = await canEditList(userId, list)
	if (!edit.ok) return { ok: false, reason: 'not-authorized' }
	return { ok: true }
}

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

export const CreateItemInputSchema = z.object({
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
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
	})
	if (!list) return { kind: 'error', reason: 'list-not-found' }

	const perm = await assertCanEditItems(userId, list)
	if (!perm.ok) return { kind: 'error', reason: 'not-authorized' }

	const url = data.url ?? null
	const vendor = url ? getVendorFromUrl(url) : null

	// Inherit ratings from the most recent successful scrape of this URL,
	// if one exists. Form-driven scrapes happen before the item exists, so
	// they persist to itemScrapes without an itemId; this is where those
	// ratings make it onto the item row.
	let inheritedRating: { ratingValue: number | null; ratingCount: number | null } | null = null
	if (url) {
		const settings = await getAppSettings(dbx)
		inheritedRating = await loadCachedScrapeRating(dbx, url, { ttlHours: settings.scrapeCacheTtlHours })
	}

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
			imageUrl: httpsUpgradeOrNull(data.imageUrl ?? null),
			groupId: data.groupId ?? null,
			ratingValue: inheritedRating?.ratingValue ?? null,
			ratingCount: inheritedRating?.ratingCount ?? null,
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

export const UpdateItemInputSchema = z.object({
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
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
	})
	if (!list) return { kind: 'error', reason: 'not-found' }

	const perm = await assertCanEditItems(userId, list)
	if (!perm.ok) return { kind: 'error', reason: 'not-authorized' }

	// Mirror an external imageUrl into our bucket before writing, so
	// the row only ever sees the final URL. Returns the original on
	// any failure path.
	if (data.imageUrl !== undefined && data.imageUrl !== null) {
		data.imageUrl = httpsUpgradeOrNull(data.imageUrl) ?? data.imageUrl
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
		// Ratings belong to the previous URL; clear them so a re-scrape
		// of the new URL repopulates without stale data lingering.
		updates.ratingValue = null
		updates.ratingCount = null
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

export const DeleteItemInputSchema = z.object({
	itemId: z.number().int().positive(),
})

export type DeleteItemResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export async function deleteItemImpl(args: {
	db: SchemaDatabase
	actor: { id: string }
	input: z.output<typeof DeleteItemInputSchema>
}): Promise<DeleteItemResult> {
	const { db: dbx, actor, input } = args
	const userId = actor.id

	const item = await dbx.query.items.findFirst({
		where: eq(items.id, input.itemId),
		columns: { id: true, listId: true, imageUrl: true },
	})
	if (!item) return { kind: 'error', reason: 'not-found' }

	const list = await dbx.query.lists.findFirst({
		where: eq(lists.id, item.listId),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
	})
	if (!list) return { kind: 'error', reason: 'not-found' }

	const perm = await assertCanEditItems(userId, list)
	if (!perm.ok) return { kind: 'error', reason: 'not-authorized' }

	await dbx.delete(items).where(eq(items.id, input.itemId))
	// Post-commit storage cleanup. Best-effort; orphans are collected by
	// the future storage-gc sweeper (TODO(storage-gc)).
	await cleanupImageUrls([item.imageUrl])
	return { kind: 'ok' }
}
