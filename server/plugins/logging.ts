import { definePlugin as defineNitroPlugin } from 'nitro'

import { env } from '@/env'
import { createLogger, logger } from '@/lib/logger'
import { httpRequestDurationMs, statusClassFor } from '@/lib/observability/metrics'
import { captureServerException } from '@/lib/observability/sentry-server'

// Normalize a request path into a low-cardinality route template so the
// `route` label on http_request_duration_ms stays bounded. UUIDs and
// numeric segments collapse to `<id>`; anything else is kept as-is.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NUM_RE = /^\d+$/
function normalizeRoute(path: string): string {
	const segments = path.split('/').map(seg => {
		if (UUID_RE.test(seg)) return '<id>'
		if (NUM_RE.test(seg) && seg.length > 3) return '<id>'
		return seg
	})
	return segments.join('/') || 'unmatched'
}

// One-time "server ready" line + per-request access logs + uncaught error
// capture. The ready line is the most important of the three: it closes the
// "is the app actually listening?" question during Docker healthcheck failures.
const accessLog = createLogger('http')

const startTimestamps = new WeakMap<object, number>()

export default defineNitroPlugin(nitroApp => {
	const port = process.env.PORT ?? '3001'
	logger.info(
		{
			port,
			logLevel: env.LOG_LEVEL,
			nodeEnv: process.env.NODE_ENV ?? 'development',
			version: process.env.npm_package_version ?? 'unknown',
		},
		`server ready on :${port}`
	)

	nitroApp.hooks.hook('request', event => {
		startTimestamps.set(event as unknown as object, Date.now())
	})

	nitroApp.hooks.hook('response', (res, event) => {
		const start = startTimestamps.get(event as unknown as object)
		if (!start) return

		const req = event.req
		const url = req.url
		const method = req.method
		const status = res.status
		const durationMs = Date.now() - start

		// Parse the path from the URL (req.url may be absolute or relative).
		let path = url
		try {
			path = new URL(url, 'http://localhost').pathname
		} catch {
			// ignore; fall back to raw url
		}

		// Health probes fire every 30s in Docker; logging them at info buries real
		// traffic. Debug is the right level for routine liveness checks.
		const level = path.startsWith('/api/health') ? 'debug' : status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'

		accessLog[level]({ method, path, status, durationMs }, `${method} ${path} ${status} ${durationMs}ms`)

		// Prometheus instrumentation. Counters increment regardless of
		// whether /api/metrics is exposed; the route gate decides scrape
		// visibility, not accumulation.
		httpRequestDurationMs.observe(
			{
				route: normalizeRoute(path),
				method,
				status_class: statusClassFor(status),
			},
			durationMs
		)
	})

	nitroApp.hooks.hook('error', (err, ctx) => {
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Nitro types mark ctx.event optional; lint's flow analysis disagrees with tsc.
		const path = ctx?.event?.req.url ?? 'unknown'
		logger.error({ err, path }, 'unhandled request error')
		void captureServerException(err, { path })
	})
})
