import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

import { runAutoArchive } from '@/lib/cron/handlers'
import { recordCronRun } from '@/lib/cron/record-run'
import { checkCronAuth } from '@/lib/cron-auth'
import { createLogger } from '@/lib/logger'

const cronLog = createLogger('cron:auto-archive')

// See `src/lib/cron/handlers.ts` for the actual work; this route is the
// HTTP envelope (CRON_SECRET check + recordCronRun wrapper). Same body
// is reused by the admin "Run now" server fn.

export const Route = createFileRoute('/api/cron/auto-archive')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const authError = checkCronAuth(request, cronLog)
				if (authError) return authError
				const result = await recordCronRun({ endpoint: '/api/cron/auto-archive', run: runAutoArchive })
				return json(result)
			},
		},
	},
})
