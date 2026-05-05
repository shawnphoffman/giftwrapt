import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

import { runCleanupVerification } from '@/lib/cron/handlers'
import { recordCronRun } from '@/lib/cron/record-run'
import { checkCronAuth } from '@/lib/cron-auth'
import { createLogger } from '@/lib/logger'

const cronLog = createLogger('cron:cleanup-verification')

export const Route = createFileRoute('/api/cron/cleanup-verification')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const authError = checkCronAuth(request, cronLog)
				if (authError) return authError
				const result = await recordCronRun({ endpoint: '/api/cron/cleanup-verification', run: runCleanupVerification })
				return json(result)
			},
		},
	},
})
