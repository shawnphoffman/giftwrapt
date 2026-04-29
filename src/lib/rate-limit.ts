// In-memory fixed-window rate limiter. See sec-review H2.
//
// Single-instance only: state lives in this module's local Map. For a
// multi-instance deployment swap the `consume` body for a Redis-backed
// implementation (a single SET with NX EX + INCR works); the public
// surface stays the same. The app today is single-instance (Docker
// compose / one Vercel function), so the in-memory version is the
// right amount of complexity.
//
// Pattern:
//   const limiter = createRateLimiter({ name: 'comments', max: 30, windowMs: 60_000 })
//   const result = limiter.consume(`user:${userId}`)
//   if (!result.allowed) throw new RateLimitError(result.retryAfterMs)

export interface RateLimitConfig {
	name: string
	max: number
	windowMs: number
}

export interface RateLimitResult {
	allowed: boolean
	remaining: number
	retryAfterMs: number
}

export interface RateLimiter {
	readonly name: string
	consume: (key: string) => RateLimitResult
	// Reset all counters. Test-only.
	_resetForTesting: () => void
}

export class RateLimitError extends Error {
	readonly name = 'RateLimitError'
	readonly retryAfterMs: number
	readonly limiterName: string
	constructor(limiterName: string, retryAfterMs: number) {
		super(`rate limit exceeded for ${limiterName}, retry after ${Math.ceil(retryAfterMs / 1000)}s`)
		this.limiterName = limiterName
		this.retryAfterMs = retryAfterMs
	}
}

interface Bucket {
	count: number
	windowStart: number
}

export function createRateLimiter(config: RateLimitConfig): RateLimiter {
	if (config.max <= 0 || config.windowMs <= 0) {
		throw new Error('rate limiter max and windowMs must both be positive')
	}
	const buckets = new Map<string, Bucket>()

	function consume(key: string): RateLimitResult {
		const now = Date.now()
		const existing = buckets.get(key)
		if (!existing || now - existing.windowStart >= config.windowMs) {
			// Start a new window. The bucket starts at 1 because this call counts.
			buckets.set(key, { count: 1, windowStart: now })
			return { allowed: true, remaining: config.max - 1, retryAfterMs: 0 }
		}
		if (existing.count >= config.max) {
			const retryAfterMs = config.windowMs - (now - existing.windowStart)
			return { allowed: false, remaining: 0, retryAfterMs }
		}
		existing.count += 1
		return { allowed: true, remaining: config.max - existing.count, retryAfterMs: 0 }
	}

	return {
		name: config.name,
		consume,
		_resetForTesting() {
			buckets.clear()
		},
	}
}

/**
 * Pulls a stable key for rate-limiting purposes. Prefers the
 * authenticated user id; falls back to the request's client IP. The IP
 * comes from `x-forwarded-for` (first hop) or `x-real-ip`, then the
 * runtime's address. We trust those headers because Nitro's standard
 * deploys (Vercel, Fly, Docker behind Caddy/Nginx) all set them; if
 * you're deploying behind a proxy that doesn't, every caller falls
 * into a single bucket and the limiter degrades to a global cap.
 */
export function rateLimitKeyForRequest(request: Request, userId?: string | null): string {
	if (userId) return `user:${userId}`
	const xff = request.headers.get('x-forwarded-for')
	if (xff) {
		const first = xff.split(',')[0]?.trim()
		if (first) return `ip:${first}`
	}
	const real = request.headers.get('x-real-ip')
	if (real) return `ip:${real.trim()}`
	return 'ip:unknown'
}
