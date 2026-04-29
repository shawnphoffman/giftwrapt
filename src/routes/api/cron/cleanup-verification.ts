import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { lt } from 'drizzle-orm'

import { db } from '@/db'
import { verification } from '@/db/schema'
import { checkCronAuth } from '@/lib/cron-auth'
import { createLogger } from '@/lib/logger'

const cronLog = createLogger('cron:cleanup-verification')

// ===============================
// Verification token cleanup cron
// ===============================
// better-auth writes rows to the `verification` table for password
// resets, email verifications, etc. The library never deletes them
// after they expire, so the table grows monotonically (and expired
// rows still expose `identifier` -> recently-active emails on a DB
// dump). Wipe everything past `expiresAt` daily.
//
// Protected by CRON_SECRET bearer-token check (see lib/cron-auth.ts).
// See sec-review M7.

export const Route = createFileRoute('/api/cron/cleanup-verification')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const started = Date.now()
				const authError = checkCronAuth(request, cronLog)
				if (authError) return authError

				const now = new Date()
				const result = await db.delete(verification).where(lt(verification.expiresAt, now))
				const deleted = result.rowCount ?? 0
				const durationMs = Date.now() - started

				cronLog.info({ deleted, durationMs }, 'verification cleanup complete')
				return json({ ok: true, deleted, durationMs })
			},
		},
	},
})
