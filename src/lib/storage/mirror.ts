// Best-effort: download an external image URL and store it in our bucket
// so the record references a URL we own. Gated by the
// `mirrorExternalImagesOnSave` admin setting; called from item and list-addon
// create/update after the row has been written. `mirrorRemoteImage` is
// also the entry point for bulk passes over existing rows (rows saved
// before the setting was on, or whose mirror failed on save).
//
// The `...ToStorage` / `...ForAddon` wrappers return the new storage URL on
// success, or `null` if the URL was skipped (already a storage URL, storage
// disabled) or the fetch/process/upload chain failed (warning logged).
// `mirrorRemoteImage` returns the same outcome with the reason attached.

import { env } from '@/env'
import { createLogger } from '@/lib/logger'
import { safeFetch } from '@/lib/scrapers/safe-fetch'

import { getStorage, isStorageConfigured } from './adapter'
import { assertImageBytes, processImage } from './image-pipeline'
import { itemImageKey, parseKeyFromUrl, purchaseAttachmentKey } from './keys'

const log = createLogger('storage.mirror')

const FETCH_TIMEOUT_MS = 15_000
const MAX_BYTES = env.STORAGE_MAX_UPLOAD_MB * 1024 * 1024

// Some retailer CDNs answer a bare Node fetch with 403. A browser UA plus an
// image Accept header gets the same bytes the <img> tag would. AVIF is left
// out on purpose: content-negotiating CDNs (IKEA, imgix) then send AVIF that
// sharp can fail to decode, and they serve webp just as readily.
const FETCH_HEADERS: Record<string, string> = {
	'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
	accept: 'image/webp,image/png,image/jpeg,image/*;q=0.8',
}

export type MirrorResult =
	| { kind: 'ok'; url: string }
	// dryRun only: fetched and processed fine, nothing uploaded.
	| { kind: 'would-mirror' }
	| { kind: 'skipped'; reason: 'storage-not-configured' | 'already-stored' | 'unsupported-url' }
	| { kind: 'failed'; reason: 'bad-status' | 'too-large' | 'empty' | 'not-an-image' | 'error'; status?: number; message?: string }

export async function mirrorRemoteImageToStorage(remoteUrl: string, itemId: number): Promise<string | null> {
	const result = await mirrorRemoteImage(remoteUrl, { kind: 'item', id: itemId })
	return result.kind === 'ok' ? result.url : null
}

// List-addon images share the addon purchase-attachment key space
// (`purchases/addon/<id>/...`), so admin storage already classifies them.
export async function mirrorRemoteImageForAddon(remoteUrl: string, addonId: number): Promise<string | null> {
	const result = await mirrorRemoteImage(remoteUrl, { kind: 'addon', id: addonId })
	return result.kind === 'ok' ? result.url : null
}

export type MirrorTarget = { kind: 'item' | 'addon'; id: number }

// `dryRun` runs the whole fetch + validate + process chain but stops short
// of the upload: a way to audit which stored image URLs are dead or
// unusable before (or without) writing anything to storage.
export async function mirrorRemoteImage(remoteUrl: string, target: MirrorTarget, opts: { dryRun?: boolean } = {}): Promise<MirrorResult> {
	const logCtx: Record<string, number> = target.kind === 'item' ? { itemId: target.id } : { addonId: target.id }
	const storage = opts.dryRun ? null : getStorage()
	if (!opts.dryRun && (!isStorageConfigured() || !storage)) return { kind: 'skipped', reason: 'storage-not-configured' }

	// Already a URL we minted: skip.
	if (parseKeyFromUrl(remoteUrl, env.STORAGE_PUBLIC_URL)) return { kind: 'skipped', reason: 'already-stored' }

	// Protocol-relative (`//cdn.example.com/x.jpg`) is how some scraped
	// pages emit image URLs; browsers resolve it against the page scheme,
	// which is always https for us.
	const absolute = remoteUrl.startsWith('//') ? `https:${remoteUrl}` : remoteUrl

	// Cheap protocol check before invoking safeFetch (which also rejects
	// non-http(s), but returning a typed skip here keeps the log line
	// quieter for obvious skips like ftp: URLs).
	let parsed: URL
	try {
		parsed = new URL(absolute)
	} catch {
		return { kind: 'skipped', reason: 'unsupported-url' }
	}

	try {
		let buf: Buffer
		if (parsed.protocol === 'data:') {
			const decoded = decodeBase64ImageDataUrl(absolute)
			if (!decoded) return { kind: 'skipped', reason: 'unsupported-url' }
			buf = decoded
		} else if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
			const fetched = await fetchImageBytes(absolute, logCtx)
			if (!Buffer.isBuffer(fetched)) return fetched
			buf = fetched
		} else {
			return { kind: 'skipped', reason: 'unsupported-url' }
		}

		if (buf.length === 0) {
			log.warn({ ...logCtx, remoteUrl }, 'mirror.fetch.empty')
			return { kind: 'failed', reason: 'empty' }
		}
		if (buf.length > MAX_BYTES) {
			log.warn({ ...logCtx, size: buf.length }, 'mirror.fetch.too-large')
			return { kind: 'failed', reason: 'too-large' }
		}
		try {
			assertImageBytes(buf)
		} catch (error) {
			log.warn({ err: error, ...logCtx, remoteUrl }, 'mirror.not-an-image')
			return { kind: 'failed', reason: 'not-an-image' }
		}
		const processed = await processImage(buf, 'item')
		if (!storage) return { kind: 'would-mirror' }
		const key = target.kind === 'item' ? itemImageKey(target.id) : purchaseAttachmentKey('addon', target.id, 'webp')
		await storage.upload(key, processed.buffer, 'image/webp')
		return { kind: 'ok', url: storage.getPublicUrl(key) }
	} catch (error) {
		log.warn({ err: error, ...logCtx, remoteUrl }, 'mirror.failed')
		return { kind: 'failed', reason: 'error', message: error instanceof Error ? error.message : String(error) }
	}
}

async function fetchImageBytes(url: string, logCtx: Record<string, number>): Promise<Buffer | MirrorResult> {
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
	try {
		const response = await safeFetch(url, { signal: controller.signal, headers: FETCH_HEADERS })
		if (!response.ok) {
			log.warn({ ...logCtx, status: response.status, remoteUrl: url }, 'mirror.fetch.bad-status')
			try {
				await response.body?.cancel()
			} catch {}
			return { kind: 'failed', reason: 'bad-status', status: response.status }
		}
		const lenHeader = response.headers.get('content-length')
		if (lenHeader) {
			const len = Number(lenHeader)
			if (Number.isFinite(len) && len > MAX_BYTES) {
				log.warn({ ...logCtx, contentLength: len }, 'mirror.fetch.too-large')
				try {
					await response.body?.cancel()
				} catch {}
				return { kind: 'failed', reason: 'too-large' }
			}
		}
		return Buffer.from(await response.arrayBuffer())
	} finally {
		clearTimeout(timeout)
	}
}

// `data:image/<type>;base64,<payload>` only. Anything else (non-image or
// percent-encoded payloads) is left alone.
function decodeBase64ImageDataUrl(url: string): Buffer | null {
	const match = /^data:image\/[a-z0-9.+-]+;base64,(.*)$/is.exec(url)
	if (!match?.[1]) return null
	return Buffer.from(match[1], 'base64')
}
