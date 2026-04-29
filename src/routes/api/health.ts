import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { sql } from 'drizzle-orm'

import { db } from '@/db'
import { createLogger } from '@/lib/logger'

const healthLog = createLogger('api:health')

// Public health probe. Intentionally returns nothing about the build
// (version, NODE_ENV, log level, DB latency) so an unauthenticated
// scanner can't fingerprint the deployment. See sec-review H3.
//
// On success: 200 `{ status: 'ok', timestamp }`.
// On DB failure: 503 `{ status: 'error', timestamp, message }`. The
// detailed error stays in the server logs (pino captures it).
export const Route = createFileRoute('/api/health')({
	server: {
		handlers: {
			GET: async () => {
				let dbOk = false
				try {
					await db.execute(sql`SELECT 1`)
					dbOk = true
				} catch (err) {
					healthLog.error({ err }, 'database ping failed')
				}

				const body: Record<string, unknown> = {
					status: dbOk ? 'ok' : 'error',
					timestamp: new Date().toISOString(),
				}
				if (!dbOk) body.message = 'Database unreachable'

				return json(body, { status: dbOk ? 200 : 503 })
			},
		},
	},
})
