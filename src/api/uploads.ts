import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { giftedItems, items, listAddons, lists, users } from '@/db/schema'
import { env } from '@/env'
import { auth } from '@/lib/auth'
import { createLogger, loggingMiddleware } from '@/lib/logger'
import { canEditListAsAnyone } from '@/lib/permissions'
import { parseReceiptUrl } from '@/lib/receipts'
import { getStorage } from '@/lib/storage/adapter'
import { processAttachment } from '@/lib/storage/attachment-pipeline'
import { err, ok, UploadError, type UploadResult } from '@/lib/storage/errors'
import { assertImageBytes, processImage } from '@/lib/storage/image-pipeline'
import { avatarKey, parseKeyFromUrl, receiptKey } from '@/lib/storage/keys'
import { LIMITS } from '@/lib/validation/limits'
import { adminAuthMiddleware, authMiddleware } from '@/middleware/auth'

import { uploadItemImageImpl } from './_item-image-impl'
import { attachReceiptImpl, detachReceiptImpl } from './_receipts-impl'

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
// try/catch. Returns whether the delete succeeded. No-ops when storage is
// disabled (callers already guard their happy path; this just keeps the
// best-effort cleanup paths from throwing).
async function deleteKey(key: string): Promise<boolean> {
	const storage = getStorage()
	if (!storage) return false
	try {
		await storage.delete(key)
		return true
	} catch (error) {
		log.warn({ err: error, key }, 'storage.delete.failed')
		return false
	}
}

const STORAGE_DISABLED_MESSAGE = 'image uploads are not configured on this server'

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
		const storage = getStorage()
		if (!storage) return err('upstream', STORAGE_DISABLED_MESSAGE)

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
			assertImageBytes(raw)
			const processed = await processImage(raw, 'avatar')
			buffer = processed.buffer
		} catch (error) {
			if (error instanceof UploadError) return err(error.reason, error.message)
			log.error({ err: error }, 'avatar.pipeline.unexpected')
			return err('pipeline-failed', 'image processing failed')
		}

		const key = avatarKey(userId)
		try {
			await storage.upload(key, buffer, 'image/webp')
		} catch (error) {
			if (error instanceof UploadError) return err(error.reason, error.message)
			return err('upstream', 'storage upload failed')
		}

		const url = storage.getPublicUrl(key)
		// Route through better-auth so its cookieCache (see src/lib/auth.ts)
		// invalidates; a raw db.update would leave the client reading the stale
		// cached user for up to 10 minutes after upload.
		await auth.api.updateUser({ body: { image: url }, headers: getRequestHeaders() })

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

		await auth.api.updateUser({ body: { image: null }, headers: getRequestHeaders() })

		if (oldUrl) {
			const oldKey = parseKeyFromUrl(oldUrl, env.STORAGE_PUBLIC_URL)
			if (oldKey) void deleteKey(oldKey)
		}

		return ok({ ok: true })
	})

// ===============================
// Admin avatar upload
// ===============================

// Admin-initiated avatar updates for another user. We skip auth.api.updateUser
// (it would target the admin's own session, not the edited user) and write
// directly. The target user's cookieCache will refresh on its 10-minute
// schedule, same caveat as updateUserAsAdmin for other fields.

export const uploadAvatarAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator(formDataValidator)
	.handler(async ({ data }): Promise<UploadResult<{ url: string }>> => {
		const storage = getStorage()
		if (!storage) return err('upstream', STORAGE_DISABLED_MESSAGE)

		const file = data.get('file')
		if (!(file instanceof File)) return err('bad-mime', 'missing "file" field')

		const userIdRaw = data.get('userId')
		if (typeof userIdRaw !== 'string' || !userIdRaw) return err('not-found', 'missing userId')
		const userId = userIdRaw

		if (file.size > MAX_BYTES) return err('too-large', `file exceeds ${env.STORAGE_MAX_UPLOAD_MB} MB limit`)
		if (file.size === 0) return err('bad-mime', 'file is empty')

		const user = await db.query.users.findFirst({
			where: eq(users.id, userId),
			columns: { image: true },
		})
		if (!user) return err('not-found', 'user not found')
		const oldUrl = user.image ?? null

		let buffer: Buffer
		try {
			const raw = await readFileAsBuffer(file)
			assertImageBytes(raw)
			const processed = await processImage(raw, 'avatar')
			buffer = processed.buffer
		} catch (error) {
			if (error instanceof UploadError) return err(error.reason, error.message)
			log.error({ err: error, userId }, 'admin.avatar.pipeline.unexpected')
			return err('pipeline-failed', 'image processing failed')
		}

		const key = avatarKey(userId)
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

const RemoveAvatarAsAdminSchema = z.object({
	userId: z.string().min(1),
})

export const removeAvatarAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof RemoveAvatarAsAdminSchema>) => RemoveAvatarAsAdminSchema.parse(data))
	.handler(async ({ data }): Promise<UploadResult<{ ok: true }>> => {
		const user = await db.query.users.findFirst({
			where: eq(users.id, data.userId),
			columns: { image: true },
		})
		if (!user) return err('not-found', 'user not found')
		const oldUrl = user.image ?? null

		await db.update(users).set({ image: null }).where(eq(users.id, data.userId))

		if (oldUrl) {
			const oldKey = parseKeyFromUrl(oldUrl, env.STORAGE_PUBLIC_URL)
			if (oldKey) void deleteKey(oldKey)
		}

		return ok({ ok: true })
	})

// ===============================
// Item image upload
// ===============================

// Same gate as item create/update: the owner, or anyone canEditList admits.
type ListForPermCheck = { id: number; ownerId: string; subjectDependentId: string | null; isPrivate: boolean; isActive: boolean }

async function canUserEditItemsOn(userId: string, list: ListForPermCheck): Promise<boolean> {
	return (await canEditListAsAnyone(userId, list)).ok
}

// Same FormData rationale as uploadAvatar. `itemId` is a form field; File
// under the `file` field; we parse and validate inline. The rest is shared
// with the mobile API (see _item-image-impl.ts).

export const uploadItemImage = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator(formDataValidator)
	.handler(async ({ context, data }): Promise<UploadResult<{ url: string }>> => {
		if (!getStorage()) return err('upstream', STORAGE_DISABLED_MESSAGE)

		const file = data.get('file')
		if (!(file instanceof File)) return err('bad-mime', 'missing "file" field')

		const itemIdParsed = z.coerce.number().int().positive().safeParse(data.get('itemId'))
		if (!itemIdParsed.success) return err('not-found', 'invalid itemId')

		if (file.size > MAX_BYTES) return err('too-large', `file exceeds ${env.STORAGE_MAX_UPLOAD_MB} MB limit`)
		if (file.size === 0) return err('bad-mime', 'file is empty')

		return uploadItemImageImpl({
			db,
			userId: context.session.user.id,
			itemId: itemIdParsed.data,
			bytes: await readFileAsBuffer(file),
		})
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
			columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
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

// ===============================
// Purchase attachment upload / remove
// ===============================
// Receipt images and PDF gift receipts attached to a purchase (claim or
// addon). Gifter-private: the row is loaded inline and the caller must own
// it. The attachmentUrls array is the source of truth; the dedicated
// upload/remove server fns are the ONLY writers (the edit dialog's save
// path never touches this column).

type PurchaseRow = {
	id: number
	ownerId: string
	attachmentUrls: Array<string> | null
}

async function loadPurchaseForOwner(purchaseKind: 'claim' | 'addon', purchaseId: number): Promise<PurchaseRow | null> {
	if (purchaseKind === 'claim') {
		const row = await db.query.giftedItems.findFirst({
			where: eq(giftedItems.id, purchaseId),
			columns: { id: true, gifterId: true, attachmentUrls: true },
		})
		if (!row) return null
		return { id: row.id, ownerId: row.gifterId, attachmentUrls: row.attachmentUrls }
	}
	const row = await db.query.listAddons.findFirst({
		where: eq(listAddons.id, purchaseId),
		columns: { id: true, userId: true, attachmentUrls: true },
	})
	if (!row) return null
	return { id: row.id, ownerId: row.userId, attachmentUrls: row.attachmentUrls }
}

export const uploadPurchaseAttachment = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator(formDataValidator)
	.handler(async ({ context, data }): Promise<UploadResult<{ url: string }>> => {
		const storage = getStorage()
		if (!storage) return err('upstream', STORAGE_DISABLED_MESSAGE)

		const userId = context.session.user.id

		const file = data.get('file')
		if (!(file instanceof File)) return err('bad-mime', 'missing "file" field')

		const kindRaw = data.get('purchaseKind')
		if (kindRaw !== 'claim' && kindRaw !== 'addon') return err('not-found', 'invalid purchaseKind')
		const purchaseKind = kindRaw

		const idParsed = z.coerce.number().int().positive().safeParse(data.get('purchaseId'))
		if (!idParsed.success) return err('not-found', 'invalid purchaseId')
		const purchaseId = idParsed.data

		if (file.size > MAX_BYTES) return err('too-large', `file exceeds ${env.STORAGE_MAX_UPLOAD_MB} MB limit`)
		if (file.size === 0) return err('bad-mime', 'file is empty')

		const purchase = await loadPurchaseForOwner(purchaseKind, purchaseId)
		if (!purchase) return err('not-found', 'purchase not found')
		if (purchase.ownerId !== userId) return err('not-authorized', 'cannot edit this purchase')

		const existingCount = (purchase.attachmentUrls ?? []).length
		if (existingCount >= LIMITS.PURCHASE_ATTACHMENTS_MAX) {
			return err('too-large', `max ${LIMITS.PURCHASE_ATTACHMENTS_MAX} attachments per purchase`)
		}

		let processed
		try {
			const raw = await readFileAsBuffer(file)
			processed = await processAttachment(raw)
		} catch (error) {
			if (error instanceof UploadError) return err(error.reason, error.message)
			log.error({ err: error, purchaseKind, purchaseId }, 'purchase.attachment.pipeline.unexpected')
			return err('pipeline-failed', 'attachment processing failed')
		}

		const key = receiptKey(purchaseKind, purchase.id, processed.ext)
		try {
			await storage.upload(key, processed.buffer, processed.contentType)
		} catch (error) {
			if (error instanceof UploadError) return err(error.reason, error.message)
			return err('upstream', 'storage upload failed')
		}

		// The client gets `/api/receipts/<id>.<ext>`, never a storage URL: the
		// key stays server-side so a public bucket cannot expose the receipt.
		const appendResult = await attachReceiptImpl({
			userId,
			purchaseKind,
			purchaseId,
			storageKey: key,
			contentType: processed.contentType,
			ext: processed.ext,
		})

		if (appendResult.kind !== 'ok') {
			// Roll the just-uploaded object back so we don't leak storage when
			// the DB append failed.
			void deleteKey(key)
			if (appendResult.kind === 'gone') return err('not-found', 'purchase not found')
			return err('too-large', `max ${LIMITS.PURCHASE_ATTACHMENTS_MAX} attachments per purchase`)
		}

		const url = appendResult.url
		return ok({ url })
	})

const RemovePurchaseAttachmentSchema = z.object({
	purchaseKind: z.enum(['claim', 'addon']),
	purchaseId: z.number().int().positive(),
	attachmentUrl: z.string().min(1),
})

export const removePurchaseAttachment = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof RemovePurchaseAttachmentSchema>) => RemovePurchaseAttachmentSchema.parse(data))
	.handler(async ({ context, data }): Promise<UploadResult<{ ok: true }>> => {
		const userId = context.session.user.id

		const purchase = await loadPurchaseForOwner(data.purchaseKind, data.purchaseId)
		if (!purchase) return err('not-found', 'purchase not found')
		if (purchase.ownerId !== userId) return err('not-authorized', 'cannot edit this purchase')

		const current = purchase.attachmentUrls ?? []
		const next = current.filter(u => u !== data.attachmentUrl)
		// If the URL wasn't in the array, treat it as a no-op rather than 404;
		// the client may have raced a concurrent remove and the end state is
		// the same.
		const nextOrNull = next.length === 0 ? null : next

		if (data.purchaseKind === 'claim') {
			await db.update(giftedItems).set({ attachmentUrls: nextOrNull }).where(eq(giftedItems.id, purchase.id))
		} else {
			await db.update(listAddons).set({ attachmentUrls: nextOrNull }).where(eq(listAddons.id, purchase.id))
		}

		// Best-effort storage cleanup; a failed delete leaves an orphan for the
		// future storage-gc sweeper. Receipts resolve their key through the
		// purchase_attachments row; legacy attachments still carry a storage URL.
		const receipt = parseReceiptUrl(data.attachmentUrl)
		const key = receipt
			? ((await detachReceiptImpl({ receiptId: receipt.id, purchaseKind: data.purchaseKind, purchaseId: purchase.id }))?.storageKey ?? null)
			: parseKeyFromUrl(data.attachmentUrl, env.STORAGE_PUBLIC_URL)
		if (key) void deleteKey(key)

		return ok({ ok: true })
	})
