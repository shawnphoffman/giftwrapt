// Best-effort: download an external image URL and store it in our bucket
// so the record references a URL we own. Gated by the
// `mirrorExternalImagesOnSave` admin setting; called from item and list-addon
// create/update after the row has been written.
//
// Returns the new storage URL on success, or `null` if the URL was
// skipped (already a storage URL, storage disabled) or the
// fetch/process/upload chain failed (warning logged).

import { env } from '@/env'
import { createLogger } from '@/lib/logger'
import { safeFetch } from '@/lib/scrapers/safe-fetch'

import { getStorage, isStorageConfigured } from './adapter'
import { assertImageBytes, processImage } from './image-pipeline'
import { itemImageKey, parseKeyFromUrl, purchaseAttachmentKey } from './keys'

const log = createLogger('storage.mirror')

const FETCH_TIMEOUT_MS = 15_000
const MAX_BYTES = env.STORAGE_MAX_UPLOAD_MB * 1024 * 1024

export function mirrorRemoteImageToStorage(remoteUrl: string, itemId: number): Promise<string | null> {
	return mirrorRemoteImageToKey(remoteUrl, () => itemImageKey(itemId), { itemId })
}

// List-addon images share the addon purchase-attachment key space
// (`purchases/addon/<id>/...`), so admin storage already classifies them.
export function mirrorRemoteImageForAddon(remoteUrl: string, addonId: number): Promise<string | null> {
	return mirrorRemoteImageToKey(remoteUrl, () => purchaseAttachmentKey('addon', addonId, 'webp'), { addonId })
}

async function mirrorRemoteImageToKey(remoteUrl: string, makeKey: () => string, logCtx: Record<string, number>): Promise<string | null> {
	if (!isStorageConfigured()) return null
	const storage = getStorage()
	if (!storage) return null

	// Already a URL we minted: skip.
	if (parseKeyFromUrl(remoteUrl, env.STORAGE_PUBLIC_URL)) return null

	// Cheap protocol check before invoking safeFetch (which also rejects
	// non-http(s), but throwing a typed error here keeps the log line
	// quieter for obvious skips like data: URLs).
	let parsed: URL
	try {
		parsed = new URL(remoteUrl)
	} catch {
		return null
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

	try {
		const response = await safeFetch(remoteUrl, { signal: controller.signal })
		if (!response.ok) {
			log.warn({ ...logCtx, status: response.status, remoteUrl }, 'mirror.fetch.bad-status')
			return null
		}
		const lenHeader = response.headers.get('content-length')
		if (lenHeader) {
			const len = Number(lenHeader)
			if (Number.isFinite(len) && len > MAX_BYTES) {
				log.warn({ ...logCtx, contentLength: len }, 'mirror.fetch.too-large')
				try {
					await response.body?.cancel()
				} catch {}
				return null
			}
		}
		const ab = await response.arrayBuffer()
		const buf = Buffer.from(ab)
		if (buf.length === 0) {
			log.warn({ ...logCtx, remoteUrl }, 'mirror.fetch.empty')
			return null
		}
		if (buf.length > MAX_BYTES) {
			log.warn({ ...logCtx, size: buf.length }, 'mirror.fetch.too-large')
			return null
		}
		assertImageBytes(buf)
		const processed = await processImage(buf, 'item')
		const key = makeKey()
		await storage.upload(key, processed.buffer, 'image/webp')
		return storage.getPublicUrl(key)
	} catch (error) {
		log.warn({ err: error, ...logCtx, remoteUrl }, 'mirror.failed')
		return null
	} finally {
		clearTimeout(timeout)
	}
}
