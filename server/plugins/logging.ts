import { definePlugin as defineNitroPlugin } from 'nitro'

import { env } from '@/env'
import { createLogger, logger } from '@/lib/logger'

// One-time "server ready" line + per-request access logs + uncaught error
// capture. The ready line is the most important of the three: it closes the
// "is the app actually listening?" question during Docker healthcheck failures.
const accessLog = createLogger('http')

const startTimestamps = new WeakMap<object, number>()

export default defineNitroPlugin(nitroApp => {
	const port = process.env.PORT ?? '3000'
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
	})

	nitroApp.hooks.hook('error', (err, ctx) => {
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Nitro types mark ctx.event optional; lint's flow analysis disagrees with tsc.
		const path = ctx?.event?.req.url ?? 'unknown'
		logger.error({ err, path }, 'unhandled request error')
	})
})
