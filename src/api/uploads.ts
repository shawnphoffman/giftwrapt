import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { items, lists, users } from '@/db/schema'
import { env } from '@/env'
import { createLogger, loggingMiddleware } from '@/lib/logger'
import { canEditList } from '@/lib/permissions'
import { getStorage } from '@/lib/storage/adapter'
import { err, ok, UploadError, type UploadResult } from '@/lib/storage/errors'
import { processImage } from '@/lib/storage/image-pipeline'
import { avatarKey, itemImageKey, parseKeyFromUrl } from '@/lib/storage/keys'
import { authMiddleware } from '@/middleware/auth'

const log = createLogger('api:uploads')

// ===============================
// Helpers
// ===============================

const MAX_BYTES = env.STORAGE_MAX_UPLOAD_MB * 1024 * 1024

async function readFileAsBuffer(file: File): Promise<Buffer> {
	const ab = await file.arrayBuffer()
	return Buffer.from(ab)
}

// Storage delete wrapped so the caller can log-and-continue without an extra
// try/catch. Returns whether the delete succeeded.
async function deleteKey(key: string): Promise<boolean> {
	try {
		await getStorage().delete(key)
		return true
	} catch (error) {
		log.warn({ err: error, key }, 'storage.delete.failed')
		return false
	}
}

// ===============================
// Avatar upload
// ===============================

// Server fn accepts FormData directly. The `inputValidator` is a passthrough
// so the handler's `data` parameter has the FormData type; File instances
// don't round-trip through a JSON validator. We pull fields out and validate
// inline so the error shape stays consistent with the rest of the pipeline.
const formDataValidator = (data: FormData): FormData => {
	if (!(data instanceof FormData)) throw new UploadError('bad-mime', 'expected multipart/form-data')
	return data
}

export const uploadAvatar = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator(formDataValidator)
	.handler(async ({ context, data }): Promise<UploadResult<{ url: string }>> => {
		const userId = context.session.user.id
		const file = data.get('file')
		if (!(file instanceof File)) return err('bad-mime', 'missing "file" field')

		if (file.size > MAX_BYTES) return err('too-large', `file exceeds ${env.STORAGE_MAX_UPLOAD_MB} MB limit`)
		if (file.size === 0) return err('bad-mime', 'file is empty')

		// Fetch the current avatar URL so we can clean up the old object after
		// the DB is updated. Best-effort; a failed delete leaves an orphan the
		// future storage-gc sweeper will collect.
		const user = await db.query.users.findFirst({
			where: eq(users.id, userId),
			columns: { image: true },
		})
		const oldUrl = user?.image ?? null

		let buffer: Buffer
		try {
			const raw = await readFileAsBuffer(file)
			const processed = await processImage(raw, 'avatar')
			buffer = processed.buffer
		} catch (error) {
			if (error instanceof UploadError) return err(error.reason, error.message)
			log.error({ err: error }, 'avatar.pipeline.unexpected')
			return err('pipeline-failed', 'image processing failed')
		}

		const key = avatarKey(userId)
		const storage = getStorage()
		try {
			await storage.upload(key, buffer, 'image/webp')
		} catch (error) {
			if (error instanceof UploadError) return err(error.reason, error.message)
			return err('upstream', 'storage upload failed')
		}

		const url = storage.getPublicUrl(key)
		await db.update(users).set({ image: url }).where(eq(users.id, userId))

		if (oldUrl) {
			const oldKey = parseKeyFromUrl(oldUrl, env.STORAGE_PUBLIC_URL)
			if (oldKey) void deleteKey(oldKey)
		}

		return ok({ url })
	})

export const removeAvatar = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(async ({ context }): Promise<UploadResult<{ ok: true }>> => {
		const userId = context.session.user.id
		const user = await db.query.users.findFirst({
			where: eq(users.id, userId),
			columns: { image: true },
		})
		const oldUrl = user?.image ?? null

		await db.update(users).set({ image: null }).where(eq(users.id, userId))

		if (oldUrl) {
			const oldKey = parseKeyFromUrl(oldUrl, env.STORAGE_PUBLIC_URL)
			if (oldKey) void deleteKey(oldKey)
		}

		return ok({ ok: true })
	})

// ===============================
// Item image upload
// ===============================

// Permission check mirrors src/api/items.ts. Kept local here to avoid a
// cross-module helper; the `canEditList` primitive already covers the hard
// case (list-level editor grants).
type ListForPermCheck = { id: number; ownerId: string; isPrivate: boolean; isActive: boolean }

async function canUserEditItemsOn(userId: string, list: ListForPermCheck): Promise<boolean> {
	if (list.ownerId === userId) return true
	const edit = await canEditList(userId, list)
	return edit.ok
}

// Same FormData rationale as uploadAvatar. `itemId` is a form field; File
// under the `file` field; we parse and validate inline.

export const uploadItemImage = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator(formDataValidator)
	.handler(async ({ context, data }): Promise<UploadResult<{ url: string }>> => {
		const userId = context.session.user.id

		const file = data.get('file')
		if (!(file instanceof File)) return err('bad-mime', 'missing "file" field')

		const itemIdRaw = data.get('itemId')
		const itemIdParsed = z.coerce.number().int().positive().safeParse(itemIdRaw)
		if (!itemIdParsed.success) return err('not-found', 'invalid itemId')
		const itemId = itemIdParsed.data

		if (file.size > MAX_BYTES) return err('too-large', `file exceeds ${env.STORAGE_MAX_UPLOAD_MB} MB limit`)
		if (file.size === 0) return err('bad-mime', 'file is empty')

		const item = await db.query.items.findFirst({
			where: eq(items.id, itemId),
			columns: { id: true, listId: true, imageUrl: true },
		})
		if (!item) return err('not-found', 'item not found')

		const list = await db.query.lists.findFirst({
			where: eq(lists.id, item.listId),
			columns: { id: true, ownerId: true, isPrivate: true, isActive: true },
		})
		if (!list) return err('not-found', 'list not found')

		if (!(await canUserEditItemsOn(userId, list))) {
			return err('not-authorized', 'cannot edit items on this list')
		}

		const oldUrl = item.imageUrl

		let buffer: Buffer
		try {
			const raw = await readFileAsBuffer(file)
			const processed = await processImage(raw, 'item')
			buffer = processed.buffer
		} catch (error) {
			if (error instanceof UploadError) return err(error.reason, error.message)
			log.error({ err: error, itemId: item.id }, 'item.pipeline.unexpected')
			return err('pipeline-failed', 'image processing failed')
		}

		const key = itemImageKey(item.id)
		const storage = getStorage()
		try {
			await storage.upload(key, buffer, 'image/webp')
		} catch (error) {
			if (error instanceof UploadError) return err(error.reason, error.message)
			return err('upstream', 'storage upload failed')
		}

		const url = storage.getPublicUrl(key)
		// Don't bump modifiedAt: per items.ts convention, that field tracks
		// title/url/notes changes only.
		await db.update(items).set({ imageUrl: url }).where(eq(items.id, item.id))

		if (oldUrl) {
			const oldKey = parseKeyFromUrl(oldUrl, env.STORAGE_PUBLIC_URL)
			if (oldKey) void deleteKey(oldKey)
		}

		return ok({ url })
	})

const RemoveItemImageSchema = z.object({
	itemId: z.number().int().positive(),
})

export const removeItemImage = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof RemoveItemImageSchema>) => RemoveItemImageSchema.parse(data))
	.handler(async ({ context, data }): Promise<UploadResult<{ ok: true }>> => {
		const userId = context.session.user.id

		const item = await db.query.items.findFirst({
			where: eq(items.id, data.itemId),
			columns: { id: true, listId: true, imageUrl: true },
		})
		if (!item) return err('not-found', 'item not found')

		const list = await db.query.lists.findFirst({
			where: eq(lists.id, item.listId),
			columns: { id: true, ownerId: true, isPrivate: true, isActive: true },
		})
		if (!list) return err('not-found', 'list not found')

		if (!(await canUserEditItemsOn(userId, list))) {
			return err('not-authorized', 'cannot edit items on this list')
		}

		const oldUrl = item.imageUrl
		await db.update(items).set({ imageUrl: null }).where(eq(items.id, item.id))

		if (oldUrl) {
			const oldKey = parseKeyFromUrl(oldUrl, env.STORAGE_PUBLIC_URL)
			if (oldKey) void deleteKey(oldKey)
		}

		return ok({ ok: true })
	})
