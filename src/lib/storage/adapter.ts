import type { Readable } from 'node:stream'

import { env } from '@/env'

import { S3StorageAdapter } from './s3'

export interface StorageObjectSummary {
	key: string
	size: number
	lastModified: Date
	etag: string
}

// Minimal surface. list() backs the admin storage browser and the future
// orphan-sweep script.
export interface StorageAdapter {
	upload: (key: string, buffer: Buffer, contentType: string) => Promise<void>
	delete: (key: string) => Promise<void>
	stream: (key: string) => Promise<{
		body: Readable
		contentType: string
		etag: string
		contentLength: number
	}>
	// Paginated bucket listing. `cursor` is the opaque ContinuationToken from
	// a previous call; `nextCursor` is null when there are no more pages.
	list: (opts?: { prefix?: string; cursor?: string; limit?: number }) => Promise<{
		objects: Array<StorageObjectSummary>
		nextCursor: string | null
	}>
	// Pure URL resolver. Does NOT hit storage.
	getPublicUrl: (key: string) => string
	// Connectivity check used by server/plugins/storage-boot.ts. Called once at
	// server start; throws on failure so Docker healthcheck catches it before
	// real traffic arrives.
	ready: () => Promise<void>
}

let _storage: StorageAdapter | undefined

// Storage is considered "configured" only when all five required env vars are
// set. When any is missing, getStorage() returns null, upload endpoints 503,
// and the UI shows a banner + hides upload controls.
export function isStorageConfigured(): boolean {
	return Boolean(
		env.STORAGE_ENDPOINT && env.STORAGE_REGION && env.STORAGE_BUCKET && env.STORAGE_ACCESS_KEY_ID && env.STORAGE_SECRET_ACCESS_KEY
	)
}

export function getStorage(): StorageAdapter | null {
	if (_storage) return _storage
	if (!isStorageConfigured()) return null
	_storage = new S3StorageAdapter({
		endpoint: env.STORAGE_ENDPOINT!,
		region: env.STORAGE_REGION!,
		bucket: env.STORAGE_BUCKET!,
		accessKeyId: env.STORAGE_ACCESS_KEY_ID!,
		secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY!,
		forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
		publicUrlBase: env.STORAGE_PUBLIC_URL,
	})
	return _storage
}

// Test/DI seam. Not exported from the barrel; imported by test files only.
export function _setStorageForTesting(adapter: StorageAdapter | undefined): void {
	_storage = adapter
}
