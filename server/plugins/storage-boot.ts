import { definePlugin as defineNitroPlugin } from 'nitro'

import { env } from '@/env'
import { createLogger } from '@/lib/logger'
import { getStorage, isStorageConfigured } from '@/lib/storage/adapter'

// Boot check for object storage. When all five STORAGE_* env vars are set,
// we fire HeadBucket once so Docker healthcheck catches bad creds / wrong
// endpoint / missing bucket before real traffic arrives. When storage isn't
// configured at all, we log a warning and let the app boot without uploads,
// the upload endpoints 503 and the UI shows a banner.
const log = createLogger('storage.boot')

export default defineNitroPlugin(async () => {
	if (!isStorageConfigured()) {
		log.warn(
			{},
			'storage.disabled: STORAGE_* env vars not set; image uploads are disabled. Set STORAGE_ENDPOINT/REGION/BUCKET/ACCESS_KEY_ID/SECRET_ACCESS_KEY to enable.'
		)
		return
	}

	if (env.STORAGE_SKIP_BOOT_CHECK) {
		log.warn(
			{ endpoint: env.STORAGE_ENDPOINT, bucket: env.STORAGE_BUCKET },
			'storage.boot.skipped: STORAGE_SKIP_BOOT_CHECK=true. HeadBucket not attempted; image uploads will fail if credentials are wrong.'
		)
		return
	}

	const storage = getStorage()
	if (!storage) return
	try {
		await storage.ready()
		log.info(
			{
				endpoint: env.STORAGE_ENDPOINT,
				bucket: env.STORAGE_BUCKET,
				region: env.STORAGE_REGION,
				publicUrl: env.STORAGE_PUBLIC_URL ?? '(proxy via /api/files/*)',
			},
			'storage.ready'
		)
	} catch (error) {
		log.fatal(
			{
				err: error,
				endpoint: env.STORAGE_ENDPOINT,
				bucket: env.STORAGE_BUCKET,
			},
			'storage.init.failed. ' +
				"If the error is a 403, S3 credentials likely don't match the storage sidecar; " +
				'see https://giftwrapt.dev/reference/troubleshooting/#storage-init-fails-with-s3-403'
		)
		throw error
	}
})
