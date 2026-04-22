import { env } from '@/env'
import { createLogger } from '@/lib/logger'

import { getStorage } from './adapter'
import { parseKeyFromUrl } from './keys'

const log = createLogger('storage.cleanup')

// Best-effort delete of storage objects referenced by the given URLs.
// Silently skips URLs we didn't mint (V1 hotlinks, external product images).
// Always resolves; never throws. Orphans left behind are reclaimed by the
// future storage-gc sweeper. Call this AFTER the DB commit, never inside
// the transaction: S3 deletes aren't transactional and a failed delete
// shouldn't roll back real DB state.
export async function cleanupImageUrls(urls: ReadonlyArray<string | null | undefined>): Promise<void> {
	const storage = getStorage()
	// Storage disabled: nothing to clean up. DB rows were already updated by
	// the caller, so the URLs are orphaned references; fine if the operator
	// later re-enables storage with a fresh bucket.
	if (!storage) return
	for (const url of urls) {
		if (!url) continue
		const key = parseKeyFromUrl(url, env.STORAGE_PUBLIC_URL)
		if (!key) continue
		try {
			await storage.delete(key)
		} catch (error) {
			log.warn({ err: error, key }, 'storage.cleanup.failed')
		}
	}
}
