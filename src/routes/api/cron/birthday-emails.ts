import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

import { db } from '@/db'
import { checkCronAuth } from '@/lib/cron-auth'
import { createLogger } from '@/lib/logger'
import { isEmailConfigured } from '@/lib/resend'
import { getAppSettings } from '@/lib/settings-loader'

import { birthdayEmailsImpl } from './_birthday-emails-impl'

const cronLog = createLogger('cron:birthday-emails')

// ===============================
// Birthday email cron job
// ===============================
// Called daily (e.g. via Vercel Cron or external scheduler).
// Two actions:
//   1. Day-of: send "Happy Birthday" to users whose birthday is today.
//   2. Follow-up: 14 days after birthday, send "what you got" summary
//      with archived gifted items.
//
// Protected by CRON_SECRET bearer-token check (see lib/cron-auth.ts). Refuses
// to run when CRON_SECRET is unset, so an operator can't accidentally
// expose this endpoint by forgetting to configure the secret.

export const Route = createFileRoute('/api/cron/birthday-emails')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const started = Date.now()
				cronLog.info('cron run starting')

				const authError = checkCronAuth(request, cronLog)
				if (authError) return authError

				if (!(await isEmailConfigured())) {
					cronLog.info('skipped: email not configured')
					return json({ ok: true, skipped: 'email not configured', date: new Date().toISOString() })
				}

				const settings = await getAppSettings(db)
				if (!settings.enableBirthdayEmails) {
					cronLog.info('skipped: birthday emails disabled in settings')
					return json({ ok: true, skipped: 'birthday emails disabled', date: new Date().toISOString() })
				}

				const now = new Date()
				const { birthdayEmails, followUpEmails } = await birthdayEmailsImpl({ db, now })

				cronLog.info(
					{
						birthdayEmails,
						followUpEmails,
						durationMs: Date.now() - started,
					},
					'cron run complete'
				)

				return json({
					ok: true,
					birthdayEmails,
					followUpEmails,
					date: now.toISOString(),
				})
			},
		},
	},
})
