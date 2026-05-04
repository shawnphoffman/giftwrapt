import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

import { db } from '@/db'
import { autoArchiveImpl } from '@/lib/cron/auto-archive'
import { checkCronAuth } from '@/lib/cron-auth'
import { createLogger } from '@/lib/logger'
import { getAppSettings } from '@/lib/settings-loader'

const cronLog = createLogger('cron:auto-archive')

// ===============================
// Auto-archive cron job
// ===============================
// Called daily. Archives claimed items whose "reveal date" has passed:
//
// 1. Birthday lists: archive N days after the list owner's birthday.
//    Only affects items with at least one claim (unclaimed items stay).
//
// 2. Christmas lists: archive N days after Dec 25.
//    Same claim-only logic.
//
// "Archive" means setting items.isArchived = true, which reveals
// gifter info to the recipient on their Received Gifts page.
//
// Protected by CRON_SECRET bearer-token check (see lib/cron-auth.ts). Refuses
// to run when CRON_SECRET is unset, so an operator can't accidentally
// expose this endpoint by forgetting to configure the secret.

export const Route = createFileRoute('/api/cron/auto-archive')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const started = Date.now()
				cronLog.info('cron run starting')

				const authError = checkCronAuth(request, cronLog)
				if (authError) return authError

				const settings = await getAppSettings(db)
				const now = new Date()

				const { birthdayArchived, christmasArchived } = await autoArchiveImpl({
					db,
					now,
					archiveDaysAfterBirthday: settings.archiveDaysAfterBirthday,
					archiveDaysAfterChristmas: settings.archiveDaysAfterChristmas,
				})

				cronLog.info(
					{
						birthdayArchived,
						christmasArchived,
						durationMs: Date.now() - started,
					},
					'cron run complete'
				)

				return json({
					ok: true,
					birthdayArchived,
					christmasArchived,
					settings: {
						archiveDaysAfterBirthday: settings.archiveDaysAfterBirthday,
						archiveDaysAfterChristmas: settings.archiveDaysAfterChristmas,
					},
					date: now.toISOString(),
				})
			},
		},
	},
})
