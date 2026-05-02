// Multipart avatar and item-image uploads.
//
// Server-first multipart proxy (Option A from the plan). iOS posts
// `multipart/form-data` with a `file` field; the same image pipeline
// the web uses processes the bytes and writes to storage. Presigned-URL
// uploads (Option B) stay deferred.
//
// Cross-surface cookieCache invalidation: when the avatar (a `users.image`
// column) changes, we route the write through `auth.api.updateUser` over
// the bearer header so better-auth busts its cookieCache. This means a
// concurrent web session for the same user sees the new avatar on the
// next request instead of waiting up to 10 minutes. Relies on the
// `enableSessionForAPIKeys: true` flag in `src/lib/auth.ts` so apiKeys
// can stand in for cookies on this code path.

import { eq } from 'drizzle-orm'
import type { Hono } from 'hono'

import { db } from '@/db'
import { items, lists, users } from '@/db/schema'
import { env } from '@/env'
import { auth } from '@/lib/auth'
import { createLogger } from '@/lib/logger'
import { canEditList } from '@/lib/permissions'
import { getStorage } from '@/lib/storage/adapter'
import { UploadError } from '@/lib/storage/errors'
import { assertImageBytes, processImage } from '@/lib/storage/image-pipeline'
import { avatarKey, itemImageKey, parseKeyFromUrl } from '@/lib/storage/keys'

import type { MobileAuthContext } from '../auth'
import { jsonError } from '../envelope'

const log = createLogger('mobile-api:uploads')

/**
 * Re-export the calling apiKey as a bearer header so we can call
 * `auth.api.updateUser` exactly as the web does (web passes the request
 * cookie via `getRequestHeaders()`; we pass the bearer key the apiKey
 * plugin recognises). Returns null if the upstream request didn't carry
 * a bearer (which can't happen behind `requireMobileApiKey`, but the
 * guard keeps TS honest).
 */
function bearerHeadersFromContext(c: { req: { header: (name: string) => string | undefined } }): Headers | null {
	const authHeader = c.req.header('authorization')
	if (!authHeader) return null
	return new Headers({ authorization: authHeader })
}

type App = Hono<MobileAuthContext>

const MAX_BYTES = env.STORAGE_MAX_UPLOAD_MB * 1024 * 1024

async function readFileAsBuffer(file: File): Promise<Buffer> {
	const ab = await file.arrayBuffer()
	return Buffer.from(ab)
}

async function deleteKey(key: string): Promise<void> {
	const storage = getStorage()
	if (!storage) return
	try {
		await storage.delete(key)
	} catch (error) {
		log.warn({ err: error, key }, 'storage.delete.failed')
	}
}

export function registerUploadRoutes(v1: App): void {
	// POST /v1/me/avatar - multipart `file` field.
	v1.post('/me/avatar', async c => {
		const userId = c.get('userId')
		const storage = getStorage()
		if (!storage) return jsonError(c, 503, 'storage-not-configured')

		let form: FormData
		try {
			form = await c.req.formData()
		} catch {
			return jsonError(c, 400, 'invalid-input', { message: 'expected multipart/form-data' })
		}
		const file = form.get('file')
		if (!(file instanceof File)) return jsonError(c, 400, 'invalid-input', { message: 'missing file field' })
		if (file.size > MAX_BYTES) return jsonError(c, 413, 'too-large', { data: { maxBytes: MAX_BYTES } })
		if (file.size === 0) return jsonError(c, 400, 'invalid-input', { message: 'file is empty' })

		const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { image: true } })
		const oldUrl = user?.image ?? null

		let buffer: Buffer
		try {
			const raw = await readFileAsBuffer(file)
			assertImageBytes(raw)
			const processed = await processImage(raw, 'avatar')
			buffer = processed.buffer
		} catch (error) {
			if (error instanceof UploadError) return jsonError(c, 400, error.reason, { message: error.message })
			log.error({ err: error }, 'avatar.pipeline.unexpected')
			return jsonError(c, 500, 'pipeline-failed', { message: 'image processing failed' })
		}

		const key = avatarKey(userId)
		try {
			await storage.upload(key, buffer, 'image/webp')
		} catch (error) {
			if (error instanceof UploadError) return jsonError(c, 502, error.reason, { message: error.message })
			return jsonError(c, 502, 'upstream', { message: 'storage upload failed' })
		}
		const url = storage.getPublicUrl(key)
		// Route through better-auth so its cookieCache invalidates for any
		// concurrent web session of the same user. Bearer header reuses the
		// caller's apiKey; relies on `enableSessionForAPIKeys: true` in
		// `src/lib/auth.ts`. Falls back to a direct DB write if the upstream
		// somehow rejects the bearer (defensive; shouldn't happen behind
		// `requireMobileApiKey`).
		const headers = bearerHeadersFromContext(c)
		try {
			if (headers) {
				await auth.api.updateUser({ body: { image: url }, headers })
			} else {
				await db.update(users).set({ image: url }).where(eq(users.id, userId))
			}
		} catch (error) {
			log.warn({ err: error, userId }, 'avatar.updateUser.fallback')
			await db.update(users).set({ image: url }).where(eq(users.id, userId))
		}
		if (oldUrl) {
			const oldKey = parseKeyFromUrl(oldUrl, env.STORAGE_PUBLIC_URL)
			if (oldKey) void deleteKey(oldKey)
		}
		return c.json({ url })
	})

	v1.delete('/me/avatar', async c => {
		const userId = c.get('userId')
		const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { image: true } })
		const oldUrl = user?.image ?? null
		const headers = bearerHeadersFromContext(c)
		try {
			if (headers) {
				await auth.api.updateUser({ body: { image: null }, headers })
			} else {
				await db.update(users).set({ image: null }).where(eq(users.id, userId))
			}
		} catch (error) {
			log.warn({ err: error, userId }, 'avatar.updateUser.fallback')
			await db.update(users).set({ image: null }).where(eq(users.id, userId))
		}
		if (oldUrl) {
			const oldKey = parseKeyFromUrl(oldUrl, env.STORAGE_PUBLIC_URL)
			if (oldKey) void deleteKey(oldKey)
		}
		return c.json({ ok: true })
	})

	v1.post('/items/:itemId/image', async c => {
		const userId = c.get('userId')
		const itemId = Number(c.req.param('itemId'))
		if (!Number.isFinite(itemId) || itemId <= 0) return jsonError(c, 400, 'invalid-id')
		const storage = getStorage()
		if (!storage) return jsonError(c, 503, 'storage-not-configured')

		let form: FormData
		try {
			form = await c.req.formData()
		} catch {
			return jsonError(c, 400, 'invalid-input', { message: 'expected multipart/form-data' })
		}
		const file = form.get('file')
		if (!(file instanceof File)) return jsonError(c, 400, 'invalid-input', { message: 'missing file field' })
		if (file.size > MAX_BYTES) return jsonError(c, 413, 'too-large', { data: { maxBytes: MAX_BYTES } })
		if (file.size === 0) return jsonError(c, 400, 'invalid-input', { message: 'file is empty' })

		const item = await db.query.items.findFirst({ where: eq(items.id, itemId), columns: { id: true, listId: true, imageUrl: true } })
		if (!item) return jsonError(c, 404, 'item-not-found')

		const list = await db.query.lists.findFirst({
			where: eq(lists.id, item.listId),
			columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
		})
		if (!list) return jsonError(c, 404, 'list-not-found')
		if (list.ownerId !== userId) {
			const edit = await canEditList(userId, list)
			if (!edit.ok) return jsonError(c, 403, 'not-authorized')
		}

		const oldUrl = item.imageUrl
		let buffer: Buffer
		try {
			const raw = await readFileAsBuffer(file)
			assertImageBytes(raw)
			const processed = await processImage(raw, 'item')
			buffer = processed.buffer
		} catch (error) {
			if (error instanceof UploadError) return jsonError(c, 400, error.reason, { message: error.message })
			log.error({ err: error, itemId: item.id }, 'item.pipeline.unexpected')
			return jsonError(c, 500, 'pipeline-failed', { message: 'image processing failed' })
		}

		const key = itemImageKey(item.id)
		try {
			await storage.upload(key, buffer, 'image/webp')
		} catch (error) {
			if (error instanceof UploadError) return jsonError(c, 502, error.reason, { message: error.message })
			return jsonError(c, 502, 'upstream', { message: 'storage upload failed' })
		}
		const url = storage.getPublicUrl(key)
		await db.update(items).set({ imageUrl: url }).where(eq(items.id, item.id))
		if (oldUrl) {
			const oldKey = parseKeyFromUrl(oldUrl, env.STORAGE_PUBLIC_URL)
			if (oldKey) void deleteKey(oldKey)
		}
		return c.json({ url })
	})

	v1.delete('/items/:itemId/image', async c => {
		const userId = c.get('userId')
		const itemId = Number(c.req.param('itemId'))
		if (!Number.isFinite(itemId) || itemId <= 0) return jsonError(c, 400, 'invalid-id')

		const item = await db.query.items.findFirst({ where: eq(items.id, itemId), columns: { id: true, listId: true, imageUrl: true } })
		if (!item) return jsonError(c, 404, 'item-not-found')
		const list = await db.query.lists.findFirst({
			where: eq(lists.id, item.listId),
			columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
		})
		if (!list) return jsonError(c, 404, 'list-not-found')
		if (list.ownerId !== userId) {
			const edit = await canEditList(userId, list)
			if (!edit.ok) return jsonError(c, 403, 'not-authorized')
		}
		const oldUrl = item.imageUrl
		await db.update(items).set({ imageUrl: null }).where(eq(items.id, item.id))
		if (oldUrl) {
			const oldKey = parseKeyFromUrl(oldUrl, env.STORAGE_PUBLIC_URL)
			if (oldKey) void deleteKey(oldKey)
		}
		return c.json({ ok: true })
	})
}
