import { definePlugin as defineNitroPlugin } from 'nitro'

import { env } from '@/env'
import { createLogger } from '@/lib/logger'
import { getStorage } from '@/lib/storage/adapter'

// Loud-fail boot check. Fires HeadBucket once at server start; any failure
// (bad creds, wrong endpoint, missing bucket, network) aborts the process so
// Docker healthcheck catches it before real traffic arrives. Same pattern as
// server/plugins/logging.ts.
const log = createLogger('storage.boot')

export default defineNitroPlugin(async () => {
	const storage = getStorage()
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
			'storage.init.failed'
		)
		throw error
	}
})
