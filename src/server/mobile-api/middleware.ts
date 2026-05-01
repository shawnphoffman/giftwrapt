// Cross-cutting Hono middleware for the mobile API. See
// `.notes/plans/2026-04-mobile-view-and-claim.md` (Conventions).
//
// Owns:
//   - X-Min-Client-Version response header (kill switch for old iOS
//     bundles; iOS reads it on every call and refuses to make further
//     calls below the minimum).
//   - In-memory IP rate limiter wrapper that emits the standard
//     `429` + `Retry-After: <seconds>` shape with the verbose error
//     envelope.

import type { Context, MiddlewareHandler, Next } from 'hono'

import { type RateLimiter, rateLimitKeyForRequest } from '@/lib/rate-limit'

import { jsonError } from './envelope'

/**
 * Minimum iOS bundle version the server will accept. iOS reads this on
 * every `/v1/*` response; if its `CFBundleShortVersionString` is below
 * this value, the app shows "please update" and stops calling the API.
 *
 * Bump when shipping a hard break. Initial value is `1.0.0`.
 */
export const MIN_CLIENT_VERSION = '1.0.0'

/**
 * Sets `X-Min-Client-Version` on every response from the mobile API.
 * Applied at the gateway level so both authenticated and
 * unauthenticated routes (sign-in, errors from the auth middleware,
 * Hono's own `notFound`) carry it.
 */
export const minClientVersionHeader: MiddlewareHandler = async (c: Context, next: Next) => {
	await next()
	c.res.headers.set('X-Min-Client-Version', MIN_CLIENT_VERSION)
}

/**
 * Returns a Hono middleware that consumes one token from `limiter` per
 * request and converts a denied result into the locked-in 429 shape:
 *   - HTTP 429
 *   - `Retry-After: <seconds>` header (RFC 7231)
 *   - Verbose error envelope:
 *       { error: { code: "rate-limited", message,
 *                  data: { retryAfterSeconds } } }
 *
 * Keys per authenticated user when `c.var.userId` is set (after the
 * apiKey middleware), otherwise per client IP.
 */
export function rateLimit(limiter: RateLimiter): MiddlewareHandler {
	return async (c: Context, next: Next) => {
		const userId = c.get('userId') as string | undefined
		const key = rateLimitKeyForRequest(c.req.raw, userId)
		const result = limiter.consume(key)
		if (!result.allowed) {
			const retryAfterSeconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000))
			const res = jsonError(c, 429, 'rate-limited', { data: { retryAfterSeconds } })
			res.headers.set('Retry-After', String(retryAfterSeconds))
			return res
		}
		return next()
	}
}
