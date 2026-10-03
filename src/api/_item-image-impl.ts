// Server-only item image upload, shared by the web server fn
// (`uploadItemImage` in uploads.ts) and the mobile API
// (`POST /v1/items/:itemId/image`). The storage key embeds the item id,
// so both callers create the item first and upload after.
//
// Callers own reading the request: they check the declared size before
// buffering the body, then hand the bytes here. This owns the permission
// check, the image pipeline, the storage write, and swapping the item's
// imageUrl.

import { eq } from 'drizzle-orm'

import { type SchemaDatabase } from '@/db'
import { items, lists } from '@/db/schema'
import { env } from '@/env'
import { createLogger } from '@/lib/logger'
import { canEditListAsAnyone } from '@/lib/permissions'
import { getStorage } from '@/lib/storage/adapter'
import { cleanupImageUrls } from '@/lib/storage/cleanup'
import { err, ok, UploadError, type UploadResult } from '@/lib/storage/errors'
import { assertImageBytes, processImage } from '@/lib/storage/image-pipeline'
import { itemImageKey } from '@/lib/storage/keys'

const log = createLogger('api:item-image')

export const ITEM_IMAGE_MAX_BYTES = env.STORAGE_MAX_UPLOAD_MB * 1024 * 1024

export const STORAGE_DISABLED_MESSAGE = 'image uploads are not configured on this server'

export async function uploadItemImageImpl(args: {
	db: SchemaDatabase
	userId: string
	itemId: number
	bytes: Buffer
}): Promise<UploadResult<{ url: string }>> {
	const { db: dbx, userId, itemId, bytes } = args

	const storage = getStorage()
	if (!storage) return err('upstream', STORAGE_DISABLED_MESSAGE)

	if (bytes.length > ITEM_IMAGE_MAX_BYTES) return err('too-large', `file exceeds ${env.STORAGE_MAX_UPLOAD_MB} MB limit`)
	if (bytes.length === 0) return err('bad-mime', 'file is empty')

	const item = await dbx.query.items.findFirst({
		where: eq(items.id, itemId),
		columns: { id: true, listId: true, imageUrl: true },
	})
	if (!item) return err('not-found', 'item not found')

	const list = await dbx.query.lists.findFirst({
		where: eq(lists.id, item.listId),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
	})
	if (!list) return err('not-found', 'list not found')

	// Same gate as item create/update: the owner, or anyone canEditList admits.
	if (!(await canEditListAsAnyone(userId, list, dbx)).ok) {
		return err('not-authorized', 'cannot edit items on this list')
	}

	const oldUrl = item.imageUrl

	let buffer: Buffer
	try {
		assertImageBytes(bytes)
		const processed = await processImage(bytes, 'item')
		buffer = processed.buffer
	} catch (error) {
		if (error instanceof UploadError) return err(error.reason, error.message)
		log.error({ err: error, itemId: item.id }, 'item.pipeline.unexpected')
		return err('pipeline-failed', 'image processing failed')
	}

	const key = itemImageKey(item.id)
	try {
		await storage.upload(key, buffer, 'image/webp')
	} catch (error) {
		if (error instanceof UploadError) return err(error.reason, error.message)
		return err('upstream', 'storage upload failed')
	}

	const url = storage.getPublicUrl(key)
	// Don't bump modifiedAt: per items.ts convention, that field tracks
	// title/url/notes changes only.
	await dbx.update(items).set({ imageUrl: url }).where(eq(items.id, item.id))

	// Best-effort; a failed delete leaves an orphan the storage-gc sweeper
	// collects.
	if (oldUrl) void cleanupImageUrls([oldUrl])

	return ok({ url })
}
