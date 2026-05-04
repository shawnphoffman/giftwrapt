import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

import { db } from '@/db'
import { checkCronAuth } from '@/lib/cron-auth'
import { processOnce } from '@/lib/import/scrape-queue/runner'
import { createLogger } from '@/lib/logger'
import { getAppSettings } from '@/lib/settings-loader'

const cronLog = createLogger('cron:item-scrape-queue')

// ===============================
// Item scrape-queue cron job
// ===============================
// Mirror of the intelligence cron envelope. Each tick walks distinct
// users with pending+ready jobs, bounded by `scrapeQueueUsersPerInvocation`,
// and runs `processForUser` for each. Per-user advisory locks make the
// endpoint safe to call alongside a `pnpm scrape-queue:run-once` and the
// long-lived worker pattern documented in `.notes/cron-and-jobs.md`.
//
// Protected by CRON_SECRET bearer-token check (see lib/cron-auth.ts).
// Refuses to run when CRON_SECRET is unset.

export const Route = createFileRoute('/api/cron/item-scrape-queue')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const started = Date.now()
				cronLog.info('cron run starting')

				const authError = checkCronAuth(request, cronLog)
				if (authError) return authError

				const settings = await getAppSettings(db)
				if (!settings.importEnabled) {
					cronLog.info('skipped: import disabled in settings')
					return json({ ok: true, skipped: 'import disabled', date: new Date().toISOString() })
				}

				const summary = await processOnce(db, {
					usersPerInvocation: settings.scrapeQueueUsersPerInvocation,
				})

				const out = {
					ok: true,
					...summary,
					durationMs: Date.now() - started,
				}
				cronLog.info(out, 'cron run complete')
				return json(out)
			},
		},
	},
})
