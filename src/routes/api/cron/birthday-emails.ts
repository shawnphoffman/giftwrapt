import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

import { runBirthdayEmails } from '@/lib/cron/handlers'
import { recordCronRun } from '@/lib/cron/record-run'
import { checkCronAuth } from '@/lib/cron-auth'
import { createLogger } from '@/lib/logger'

const cronLog = createLogger('cron:birthday-emails')

export const Route = createFileRoute('/api/cron/birthday-emails')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const authError = checkCronAuth(request, cronLog)
				if (authError) return authError
				const result = await recordCronRun({ endpoint: '/api/cron/birthday-emails', run: runBirthdayEmails })
				return json(result)
			},
		},
	},
})
