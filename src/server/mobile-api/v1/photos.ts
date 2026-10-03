// Photo routes for the iOS Save flow:
//
//   POST /api/mobile/v1/products/by-photo   - AI guess at what a photo shows
//   POST /api/mobile/v1/items/:itemId/image - attach a photo to an item
//
// Both take `multipart/form-data` with the image under `file`. iOS
// creates the item with `POST /v1/items` first and uploads after: the
// storage key embeds the item id, same order as the web add-item dialog.
//
// `GET /v1/app-settings` reports `photoToItemEnabled` and
// `itemPhotoUploadsEnabled` so iOS can decide what to offer before the
// user picks a photo.

import type { Context, Hono } from 'hono'
import { z } from 'zod'

import { ITEM_IMAGE_MAX_BYTES, uploadItemImageImpl } from '@/api/_item-image-impl'
import { db } from '@/db'
import { env } from '@/env'
import { AiBudgetExceededError } from '@/lib/ai-call'
import { createLogger } from '@/lib/logger'
import { scrapeLimiter } from '@/lib/rate-limits'
import { extractFromPhoto } from '@/lib/scrapers/photo-extract'
import { ScrapeProviderError } from '@/lib/scrapers/types'
import { isStorageConfigured } from '@/lib/storage/adapter'
import { UploadError, type UploadErrorReason } from '@/lib/storage/errors'
import { assertImageBytes } from '@/lib/storage/image-pipeline'

import type { MobileAuthContext } from '../auth'
import { jsonError } from '../envelope'
import { rateLimit } from '../middleware'

const log = createLogger('mobile-api:photos')

const TOO_LARGE_MESSAGE = `The photo is larger than ${env.STORAGE_MAX_UPLOAD_MB} MB.`

type FileResult = { kind: 'ok'; bytes: Buffer } | { kind: 'error'; response: Response }

// Pull the `file` field out of a multipart body. Rejects on the declared
// Content-Length before buffering when it's clearly over the limit (the
// multipart envelope adds a little, hence the slack).
async function readImageFile(c: Context<MobileAuthContext>): Promise<FileResult> {
	const declared = Number(c.req.header('content-length') ?? '')
	if (Number.isFinite(declared) && declared > ITEM_IMAGE_MAX_BYTES + 64 * 1024) {
		return { kind: 'error', response: jsonError(c, 413, 'too-large', { message: TOO_LARGE_MESSAGE }) }
	}
	let form: FormData
	try {
		form = await c.req.formData()
	} catch {
		return { kind: 'error', response: jsonError(c, 400, 'invalid-input', { message: 'Expected multipart/form-data.' }) }
	}
	const file = form.get('file')
	if (!(file instanceof File)) {
		return { kind: 'error', response: jsonError(c, 400, 'invalid-input', { message: 'Missing "file" field.' }) }
	}
	if (file.size === 0) {
		return { kind: 'error', response: jsonError(c, 400, 'invalid-image', { message: 'The photo is empty.' }) }
	}
	if (file.size > ITEM_IMAGE_MAX_BYTES) {
		return { kind: 'error', response: jsonError(c, 413, 'too-large', { message: TOO_LARGE_MESSAGE }) }
	}
	return { kind: 'ok', bytes: Buffer.from(await file.arrayBuffer()) }
}

function uploadErrorResponse(c: Context<MobileAuthContext>, reason: UploadErrorReason, message: string): Response {
	switch (reason) {
		case 'too-large':
			return jsonError(c, 413, 'too-large', { message: TOO_LARGE_MESSAGE })
		case 'bad-mime':
			return jsonError(c, 400, 'invalid-image')
		case 'not-found':
			return jsonError(c, 404, 'not-found')
		case 'not-authorized':
			return jsonError(c, 403, 'not-authorized')
		case 'pipeline-failed':
			return jsonError(c, 422, 'invalid-image')
		case 'upstream':
			log.warn({ message }, 'item-image.upstream')
			return jsonError(c, 502, 'storage-failed')
	}
}

const ItemIdSchema = z.coerce.number().int().positive()

export function registerPhotoRoutes(v1: Hono<MobileAuthContext>): void {
	// POST /v1/products/by-photo - one vision call that guesses the title,
	// price, and a description from a product photo. Returns the same
	// `ScrapeResult` shape as `GET /v1/scrape` (with `imageUrls` always
	// empty) so iOS fills the form the same way. Shares the scrape rate
	// limit, same as the web route.
	//
	// Errors: `photo-to-item-disabled` (503, the admin toggle is off or no
	// AI provider is set up), `ai-budget-exceeded` (503), `timeout` (504),
	// `extract-failed` (502), `invalid-image` (400), `too-large` (413).
	v1.post('/products/by-photo', rateLimit(scrapeLimiter), async c => {
		const file = await readImageFile(c)
		if (file.kind === 'error') return file.response

		let mediaType: string
		try {
			// Trust the bytes, not the client's declared type.
			mediaType = assertImageBytes(file.bytes)
		} catch (error) {
			if (error instanceof UploadError) return jsonError(c, 400, 'invalid-image')
			throw error
		}

		try {
			const { result, ms } = await extractFromPhoto({
				bytes: new Uint8Array(file.bytes),
				mediaType,
				signal: c.req.raw.signal,
				userId: c.get('userId'),
				source: 'mobile',
			})
			return c.json({ result, ms })
		} catch (error) {
			if (error instanceof AiBudgetExceededError) return jsonError(c, 503, 'ai-budget-exceeded', { message: error.message })
			if (error instanceof ScrapeProviderError) {
				if (error.code === 'config_missing') return jsonError(c, 503, 'photo-to-item-disabled')
				if (error.code === 'timeout') return jsonError(c, 504, 'timeout')
				return jsonError(c, 502, 'extract-failed')
			}
			log.error({ err: error }, 'photo extract failed unexpectedly')
			return jsonError(c, 502, 'extract-failed')
		}
	})

	// POST /v1/items/:itemId/image - store a photo as the item's image,
	// replacing any image it had. Same permission gate as editing the
	// item. Returns `{ url }`.
	//
	// Errors: `uploads-disabled` (503, no object storage configured),
	// `invalid-id` (400), `not-found` (404), `not-authorized` (403),
	// `invalid-image` (400 or 422), `too-large` (413), `storage-failed` (502).
	v1.post('/items/:itemId/image', async c => {
		if (!isStorageConfigured()) return jsonError(c, 503, 'uploads-disabled')

		const itemId = ItemIdSchema.safeParse(c.req.param('itemId'))
		if (!itemId.success) return jsonError(c, 400, 'invalid-id')

		const file = await readImageFile(c)
		if (file.kind === 'error') return file.response

		const result = await uploadItemImageImpl({
			db,
			userId: c.get('userId'),
			itemId: itemId.data,
			bytes: file.bytes,
		})
		if (result.kind === 'error') return uploadErrorResponse(c, result.reason, result.message)
		return c.json({ url: result.value.url })
	})
}
