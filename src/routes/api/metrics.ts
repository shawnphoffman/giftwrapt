import { timingSafeEqual } from 'node:crypto'

import { createFileRoute } from '@tanstack/react-router'

import { env } from '@/env'
import { createLogger } from '@/lib/logger'
import { getMetricsStatus } from '@/lib/observability/config'
import { registry } from '@/lib/observability/metrics'

const metricsLog = createLogger('api:metrics')

// Constant-time bearer compare. Same pattern as src/lib/cron-auth.ts:
// pre-allocate to the expected length, then equality-check.
function bearerMatches(authHeader: string, secret: string): boolean {
	const expected = `Bearer ${secret}`
	const expectedBuf = Buffer.from(expected, 'utf8')
	const candidateBuf = Buffer.alloc(expectedBuf.length)
	const headerBuf = Buffer.from(authHeader, 'utf8')
	headerBuf.copy(candidateBuf, 0, 0, Math.min(headerBuf.length, expectedBuf.length))
	return headerBuf.length === expectedBuf.length && timingSafeEqual(candidateBuf, expectedBuf)
}

// Deliberately returns 404 (not 401) when disabled or token wrong, so an
// internet scanner can't fingerprint the deployment as having metrics.
function notFound(): Response {
	return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

export const Route = createFileRoute('/api/metrics')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const status = await getMetricsStatus()
				if (!status.enabled) return notFound()

				const token = env.METRICS_TOKEN
				if (!token) {
					// getMetricsStatus already gated on this; defensive.
					return notFound()
				}

				const authHeader = request.headers.get('authorization') ?? ''
				if (!bearerMatches(authHeader, token)) {
					metricsLog.warn('metrics scrape rejected: bad bearer')
					return notFound()
				}

				const body = await registry.metrics()
				return new Response(body, {
					status: 200,
					headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' },
				})
			},
		},
	},
})
