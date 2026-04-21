import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { sql } from 'drizzle-orm'

import { db } from '@/db'
import { env } from '@/env'
import { createLogger } from '@/lib/logger'

const healthLog = createLogger('api:health')

// Read version once at module load (Docker bakes this in at build time).
const appVersion = process.env.npm_package_version ?? 'unknown'
const startedAt = Date.now()

export const Route = createFileRoute('/api/health')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url)
				const verbose = url.searchParams.get('verbose') === '1'

				const dbStart = Date.now()
				let dbOk = false
				let dbError: string | undefined
				try {
					await db.execute(sql`SELECT 1`)
					dbOk = true
				} catch (err) {
					// Log with full error object so pino captures stack + message.
					// This is THE signal for diagnosing "healthcheck keeps failing."
					healthLog.error({ err }, 'database ping failed')
					dbError = err instanceof Error ? err.message : String(err)
				}
				const dbLatencyMs = Date.now() - dbStart

				const status = dbOk ? 'ok' : 'error'
				const body: Record<string, unknown> = {
					status,
					timestamp: new Date().toISOString(),
				}
				if (verbose) {
					body.db = { ok: dbOk, latencyMs: dbLatencyMs, ...(dbError ? { error: dbError } : {}) }
					body.uptimeSec = Math.round((Date.now() - startedAt) / 1000)
					body.version = appVersion
					body.logLevel = env.LOG_LEVEL
					body.nodeEnv = process.env.NODE_ENV ?? 'development'
				} else if (!dbOk) {
					// Even on the terse path, surface the error so the docker healthcheck
					// output has something to explain the failure.
					body.message = 'Database unreachable'
				}

				return json(body, { status: dbOk ? 200 : 503 })
			},
		},
	},
})
