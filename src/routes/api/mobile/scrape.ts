import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

import { createLogger } from '@/lib/logger'
import { jsonError, requireMobileSession } from '@/lib/mobile-api'
import { rateLimitKeyForRequest } from '@/lib/rate-limit'
import { scrapeLimiter } from '@/lib/rate-limits'
import { runOneShotScrape } from '@/lib/scrapers/run'

const log = createLogger('api:mobile:scrape')

// One-shot scrape used by the iOS share extension. Same orchestrator and
// providers as `/api/scrape/stream`; this just blocks for the final result
// instead of streaming per-attempt events.
export const Route = createFileRoute('/api/mobile/scrape')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const auth = await requireMobileSession(request)
				if (!auth.ok) return auth.response

				const userId = auth.session.user.id
				const rateKey = rateLimitKeyForRequest(request, userId)
				const rateResult = scrapeLimiter.consume(rateKey)
				if (!rateResult.allowed) {
					log.warn({ key: rateKey, retryAfterMs: rateResult.retryAfterMs }, 'mobile scrape rate limit exceeded')
					return new Response(JSON.stringify({ error: 'rate-limited' }), {
						status: 429,
						headers: {
							'Content-Type': 'application/json',
							'retry-after': String(Math.ceil(rateResult.retryAfterMs / 1000)),
						},
					})
				}

				const requestUrl = new URL(request.url)
				const targetUrl = requestUrl.searchParams.get('url')
				if (!targetUrl) return jsonError('missing-url', 400)
				const force = requestUrl.searchParams.get('force') === 'true'
				const acceptLanguage = request.headers.get('accept-language') ?? undefined

				const orchestrateResult = await runOneShotScrape({
					url: targetUrl,
					userId,
					force,
					acceptLanguage,
					signal: request.signal,
				})

				if (orchestrateResult.kind === 'error') {
					const status = orchestrateResult.reason === 'invalid-url' ? 400 : 502
					return json({ error: orchestrateResult.reason, attempts: orchestrateResult.attempts }, { status })
				}

				return json({
					result: orchestrateResult.result,
					fromProvider: orchestrateResult.fromProvider,
					attempts: orchestrateResult.attempts,
					cached: orchestrateResult.cached,
				})
			},
		},
	},
})
