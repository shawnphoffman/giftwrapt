import { createServerFn } from '@tanstack/react-start'
import { eq, inArray, isNotNull } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { items, lists, users } from '@/db/schema'
import { env } from '@/env'
import { createLogger, loggingMiddleware } from '@/lib/logger'
import { getStorage } from '@/lib/storage/adapter'
import { parseAvatarKey, parseItemImageKey, parseKeyFromUrl } from '@/lib/storage/keys'
import { adminAuthMiddleware } from '@/middleware/auth'

// Server fns powering /admin/storage. Lists every object in the configured
// bucket, classifies each as `attached` / `orphan` / `unknown` by reverse-
// mapping users.image and items.imageUrl through parseKeyFromUrl, and
// surfaces single-object + bulk orphan delete actions.

const log = createLogger('api.admin-storage')

const StorageNotConfigured = { kind: 'error', reason: 'storage-not-configured' } as const

export type StorageObjectKind = 'avatar' | 'item' | 'unknown'
export type StorageObjectStatus = 'attached' | 'orphan' | 'unknown'

export type StorageObjectRow = {
	key: string
	url: string
	size: number
	lastModified: Date
	kind: StorageObjectKind
	status: StorageObjectStatus
	owner: { id: string; name: string | null; email: string } | null
	target:
		| { kind: 'user'; id: string; label: string }
		| { kind: 'item'; id: number; label: string; listId: number; listName: string | null; deleted: boolean }
		| null
}

export type ListStorageObjectsResult =
	| { kind: 'ok'; objects: Array<StorageObjectRow>; nextCursor: string | null }
	| { kind: 'error'; reason: 'storage-not-configured' }

const ListInputSchema = z.object({
	prefix: z.string().optional(),
	cursor: z.string().optional(),
})

// Build the set of keys currently referenced by any DB row. Used to flip
// listed objects between `attached` and `orphan` and to refuse deleting an
// in-use key. One pass over each owning column.
async function buildInUseKeySet(): Promise<Set<string>> {
	const publicBase = env.STORAGE_PUBLIC_URL
	const inUse = new Set<string>()
	const userRows = await db.select({ image: users.image }).from(users).where(isNotNull(users.image))
	for (const row of userRows) {
		const key = parseKeyFromUrl(row.image ?? '', publicBase)
		if (key) inUse.add(key)
	}
	const itemRows = await db.select({ imageUrl: items.imageUrl }).from(items).where(isNotNull(items.imageUrl))
	for (const row of itemRows) {
		const key = parseKeyFromUrl(row.imageUrl ?? '', publicBase)
		if (key) inUse.add(key)
	}
	return inUse
}

type ItemEnrichRow = {
	id: number
	title: string
	imageUrl: string | null
	listId: number
	listName: string | null
	ownerId: string
	ownerName: string | null
	ownerEmail: string
}

async function enrichRows(
	objects: Array<{ key: string; size: number; lastModified: Date; etag: string }>,
	inUse: Set<string>
): Promise<Array<StorageObjectRow>> {
	const storage = getStorage()
	if (!storage) return []

	const avatarUserIds = new Set<string>()
	const itemIds = new Set<number>()
	for (const obj of objects) {
		const av = parseAvatarKey(obj.key)
		if (av) {
			avatarUserIds.add(av.userId)
			continue
		}
		const it = parseItemImageKey(obj.key)
		if (it) {
			const n = Number(it.itemId)
			if (Number.isFinite(n)) itemIds.add(n)
		}
	}

	const userMap = new Map<string, { id: string; name: string | null; email: string }>()
	if (avatarUserIds.size > 0) {
		const rows = await db
			.select({ id: users.id, name: users.name, email: users.email })
			.from(users)
			.where(inArray(users.id, [...avatarUserIds]))
		for (const r of rows) userMap.set(r.id, r)
	}

	const itemMap = new Map<number, ItemEnrichRow>()
	if (itemIds.size > 0) {
		const rows = await db
			.select({
				id: items.id,
				title: items.title,
				imageUrl: items.imageUrl,
				listId: items.listId,
				listName: lists.name,
				ownerId: lists.ownerId,
				ownerName: users.name,
				ownerEmail: users.email,
			})
			.from(items)
			.innerJoin(lists, eq(lists.id, items.listId))
			.innerJoin(users, eq(users.id, lists.ownerId))
			.where(inArray(items.id, [...itemIds]))
		for (const r of rows) itemMap.set(r.id, r)
	}

	const out: Array<StorageObjectRow> = []
	for (const obj of objects) {
		const url = storage.getPublicUrl(obj.key)
		const av = parseAvatarKey(obj.key)
		if (av) {
			const owner = userMap.get(av.userId) ?? null
			const status: StorageObjectStatus = inUse.has(obj.key) ? 'attached' : 'orphan'
			out.push({
				key: obj.key,
				url,
				size: obj.size,
				lastModified: obj.lastModified,
				kind: 'avatar',
				status,
				owner,
				target: owner ? { kind: 'user', id: owner.id, label: owner.name ?? owner.email } : null,
			})
			continue
		}
		const it = parseItemImageKey(obj.key)
		if (it) {
			const itemId = Number(it.itemId)
			const enriched = Number.isFinite(itemId) ? itemMap.get(itemId) : undefined
			const status: StorageObjectStatus = inUse.has(obj.key) ? 'attached' : 'orphan'
			out.push({
				key: obj.key,
				url,
				size: obj.size,
				lastModified: obj.lastModified,
				kind: 'item',
				status,
				owner: enriched ? { id: enriched.ownerId, name: enriched.ownerName, email: enriched.ownerEmail } : null,
				target: enriched
					? {
							kind: 'item',
							id: enriched.id,
							label: enriched.title,
							listId: enriched.listId,
							listName: enriched.listName,
							deleted: false,
						}
					: Number.isFinite(itemId)
						? { kind: 'item', id: itemId, label: `(item #${itemId})`, listId: -1, listName: null, deleted: true }
						: null,
			})
			continue
		}
		out.push({
			key: obj.key,
			url,
			size: obj.size,
			lastModified: obj.lastModified,
			kind: 'unknown',
			status: 'unknown',
			owner: null,
			target: null,
		})
	}
	return out
}

// Single page of objects, enriched with attachment + owner info.
export const listStorageObjectsAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ListInputSchema>) => ListInputSchema.parse(data))
	.handler(async ({ data }): Promise<ListStorageObjectsResult> => {
		const storage = getStorage()
		if (!storage) return StorageNotConfigured
		const page = await storage.list({ prefix: data.prefix, cursor: data.cursor, limit: 100 })
		const inUse = await buildInUseKeySet()
		const objects = await enrichRows(page.objects, inUse)
		return { kind: 'ok', objects, nextCursor: page.nextCursor }
	})

export type StorageSummary = {
	totalCount: number
	totalBytes: number
	orphanCount: number
	orphanBytes: number
	// True when the bucket walk hit `WALK_OBJECT_CAP` and stopped before
	// reading the full bucket. The summary numbers are accurate for what
	// was scanned but undercount the rest.
	truncated: boolean
}

// Hard cap on the bucket walk in `walkAllObjects` so a misbehaving or
// genuinely huge bucket can't OOM the worker. Each entry is small
// (~64 bytes) so 100k = ~6.4MB; well below any function memory tier.
// See sec-review M8.
const WALK_OBJECT_CAP = 100_000

export type StorageSummaryResult = { kind: 'ok'; summary: StorageSummary } | { kind: 'error'; reason: 'storage-not-configured' }

// Whole-bucket walk to compute totals + orphan count for the page header
// and the bulk-delete confirm dialog. Loops every page from list().
//
// Capped at WALK_OBJECT_CAP entries to bound memory + DoS exposure on
// pathological buckets (sec-review M8). Callers receive `truncated:
// true` when the cap is hit; the bulk-delete-orphans path refuses to
// run in that case, since it would only delete the orphans visible
// within the cap and leave the rest.
async function walkAllObjects(): Promise<{ inUse: Set<string>; all: Array<{ key: string; size: number }>; truncated: boolean }> {
	const storage = getStorage()
	if (!storage) throw new Error('storage-not-configured')
	const inUse = await buildInUseKeySet()
	const all: Array<{ key: string; size: number }> = []
	let cursor: string | undefined
	let truncated = false
	do {
		const page = await storage.list({ cursor, limit: 1000 })
		for (const obj of page.objects) {
			if (all.length >= WALK_OBJECT_CAP) {
				truncated = true
				break
			}
			all.push({ key: obj.key, size: obj.size })
		}
		if (truncated) break
		cursor = page.nextCursor ?? undefined
	} while (cursor)
	return { inUse, all, truncated }
}

export const getStorageSummaryAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.handler(async (): Promise<StorageSummaryResult> => {
		if (!getStorage()) return StorageNotConfigured
		const { inUse, all, truncated } = await walkAllObjects()
		let totalBytes = 0
		let orphanCount = 0
		let orphanBytes = 0
		for (const obj of all) {
			totalBytes += obj.size
			if (!inUse.has(obj.key)) {
				orphanCount += 1
				orphanBytes += obj.size
			}
		}
		return { kind: 'ok', summary: { totalCount: all.length, totalBytes, orphanCount, orphanBytes, truncated } }
	})

const DeleteKeySchema = z.object({ key: z.string().min(1) })

export type DeleteStorageObjectResult = { kind: 'ok' } | { kind: 'error'; reason: 'storage-not-configured' | 'in-use' | 'not-found' }

export const deleteStorageObjectAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof DeleteKeySchema>) => DeleteKeySchema.parse(data))
	.handler(async ({ data }): Promise<DeleteStorageObjectResult> => {
		const storage = getStorage()
		if (!storage) return StorageNotConfigured
		// Refresh the in-use set right at delete time so a row that was
		// attached when the page loaded but has since been edited can't be
		// silently deleted by a stale click.
		const inUse = await buildInUseKeySet()
		if (inUse.has(data.key)) return { kind: 'error', reason: 'in-use' }
		try {
			await storage.delete(data.key)
		} catch (error) {
			const name = (error as { code?: string }).code
			if (name === 'not-found') return { kind: 'error', reason: 'not-found' }
			log.error({ err: error, key: data.key }, 'admin.delete.failed')
			throw error
		}
		return { kind: 'ok' }
	})

const DeleteOrphansSchema = z.object({ dryRun: z.boolean().optional() })

export type DeleteOrphansResult =
	| { kind: 'ok'; orphanCount: number; deleted: number; failed: number; dryRun: boolean }
	| { kind: 'error'; reason: 'storage-not-configured' | 'walk-truncated' }

export const deleteOrphansAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof DeleteOrphansSchema>) => DeleteOrphansSchema.parse(data))
	.handler(async ({ data }): Promise<DeleteOrphansResult> => {
		const storage = getStorage()
		if (!storage) return StorageNotConfigured
		const { inUse, all, truncated } = await walkAllObjects()
		// Refuse to bulk-delete when the walk hit the cap: we'd only see
		// the first WALK_OBJECT_CAP objects and would miss orphans past
		// that point. Operator should clean those up via a one-shot
		// script before running the UI button. See sec-review M8.
		if (truncated) {
			return { kind: 'error', reason: 'walk-truncated' }
		}
		const orphans = all.filter(o => !inUse.has(o.key))
		if (data.dryRun) {
			return { kind: 'ok', orphanCount: orphans.length, deleted: 0, failed: 0, dryRun: true }
		}
		let deleted = 0
		let failed = 0
		for (const obj of orphans) {
			try {
				await storage.delete(obj.key)
				deleted += 1
			} catch (error) {
				failed += 1
				log.warn({ err: error, key: obj.key }, 'admin.orphan-delete.failed')
			}
		}
		return { kind: 'ok', orphanCount: orphans.length, deleted, failed, dryRun: false }
	})
