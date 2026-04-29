// TanStack Start server-function rate-limit middleware. See sec-review H2.
//
// Wraps any of the limiters declared in `src/lib/rate-limits.ts` and
// keys per authenticated user (when used after `authMiddleware`) or
// per client IP (otherwise). Throws a `RateLimitError` on exceed,
// which the framework surfaces to the client as a generic error.

import { createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

import { createLogger } from '@/lib/logger'
import { type RateLimiter, RateLimitError, rateLimitKeyForRequest } from '@/lib/rate-limit'

const log = createLogger('rate-limit')

// Walk the framework's session context (set by authMiddleware) to find
// a userId, falling back to undefined for unauth callers.
function userIdFromContext(context: unknown): string | undefined {
	if (!context || typeof context !== 'object') return undefined
	const c = context as Record<string, unknown>
	const session = c.session
	if (!session || typeof session !== 'object') return undefined
	const user = (session as Record<string, unknown>).user
	if (!user || typeof user !== 'object') return undefined
	const id = (user as Record<string, unknown>).id
	return typeof id === 'string' ? id : undefined
}

/**
 * Returns a TanStack server-fn middleware that consumes one token from
 * `limiter` per call and throws on exceed. Place AFTER `authMiddleware`
 * if you want per-user keys; otherwise it falls back to per-IP.
 */
export function rateLimit(limiter: RateLimiter) {
	return createMiddleware().server(async ({ next, context }) => {
		const request = getRequest()
		const userId = userIdFromContext(context)
		const key = rateLimitKeyForRequest(request, userId)
		const result = limiter.consume(key)
		if (!result.allowed) {
			log.warn({ limiter: limiter.name, key, retryAfterMs: result.retryAfterMs }, 'rate limit exceeded')
			throw new RateLimitError(limiter.name, result.retryAfterMs)
		}
		return next()
	})
}
