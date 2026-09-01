// Database-backed fixed-window rate limiter. See sec-review S1.
//
// Counterpart to the in-memory limiter in `./rate-limit.ts`, which keeps
// state in a module-local Map and therefore hands every instance (and
// every serverless cold start) its own budget. Use this one where the
// limiter IS the security control rather than a cost-shaping nicety:
// credential endpoints that run before a session exists.
//
// The window advance and the increment happen in a single atomic upsert,
// so concurrent requests across instances cannot both observe a stale
// count and double-spend the budget. Over-limit calls still increment;
// that is standard fixed-window behavior and does not extend the window,
// because `window_start` only moves when the window actually rolls over.

import { sql } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { db as defaultDb } from '@/db'
import { rateLimitBuckets } from '@/db/schema'

import type { RateLimitConfig, RateLimitResult } from './rate-limit'

export interface AsyncRateLimiter {
	readonly name: string
	consume: (key: string, dbx?: SchemaDatabase) => Promise<RateLimitResult>
	// Clear this limiter's counters. Test-only.
	_resetForTesting: (dbx?: SchemaDatabase) => Promise<void>
}

// Expired rows are dead weight, but pruning on every call would double
// the query count on the hot path. Prune at most once per interval per
// process instead; the table is tiny and correctness never depends on
// the sweep having run.
const PRUNE_INTERVAL_MS = 5 * 60_000

export function createDbRateLimiter(config: RateLimitConfig): AsyncRateLimiter {
	if (config.max <= 0 || config.windowMs <= 0) {
		throw new Error('rate limiter max and windowMs must both be positive')
	}
	const prefix = `${config.name}:`
	let lastPruneAt = 0

	async function consume(key: string, dbx: SchemaDatabase = defaultDb): Promise<RateLimitResult> {
		const storedKey = `${prefix}${key}`
		const windowInterval = sql`make_interval(secs => ${config.windowMs / 1000})`
		// `clock_timestamp()`, never `now()`: `now()` is the transaction
		// timestamp and is frozen for the life of a transaction, so a
		// limiter consulted twice inside one transaction would never see
		// its window roll over.
		const nowExpr = sql`clock_timestamp()`

		// Single statement: start a new window when the stored one has
		// aged out, otherwise increment in place. Returns the post-write
		// state so the decision below needs no second read.
		const rows = await dbx
			.insert(rateLimitBuckets)
			.values({ key: storedKey, count: 1, windowStart: sql`clock_timestamp()` as unknown as Date })
			.onConflictDoUpdate({
				target: rateLimitBuckets.key,
				set: {
					count: sql`CASE WHEN ${rateLimitBuckets.windowStart} <= ${nowExpr} - ${windowInterval} THEN 1 ELSE ${rateLimitBuckets.count} + 1 END`,
					windowStart: sql`CASE WHEN ${rateLimitBuckets.windowStart} <= ${nowExpr} - ${windowInterval} THEN ${nowExpr} ELSE ${rateLimitBuckets.windowStart} END`,
				},
			})
			.returning({ count: rateLimitBuckets.count, windowStart: rateLimitBuckets.windowStart })

		// `.at(0)`, not `[0]`: an upsert with DO UPDATE always returns a
		// row, but the index signature would type the guard below away.
		const row = rows.at(0)
		// A failed upsert should not hand out a free pass, but it also
		// should not lock every user out of signing in. Treat it as
		// allowed-with-no-budget-info and let the outer handler proceed.
		if (!row) return { allowed: true, remaining: config.max - 1, retryAfterMs: 0 }

		void pruneExpired(dbx)

		const elapsedMs = Date.now() - row.windowStart.getTime()
		const retryAfterMs = Math.max(0, config.windowMs - elapsedMs)
		if (row.count > config.max) {
			return { allowed: false, remaining: 0, retryAfterMs }
		}
		return { allowed: true, remaining: config.max - row.count, retryAfterMs: 0 }
	}

	async function pruneExpired(dbx: SchemaDatabase): Promise<void> {
		const now = Date.now()
		if (now - lastPruneAt < PRUNE_INTERVAL_MS) return
		lastPruneAt = now
		try {
			await dbx
				.delete(rateLimitBuckets)
				.where(
					sql`${rateLimitBuckets.key} LIKE ${prefix + '%'} AND ${rateLimitBuckets.windowStart} <= clock_timestamp() - make_interval(secs => ${config.windowMs / 1000})`
				)
		} catch {
			// Housekeeping only; a failed prune must never fail a request.
		}
	}

	return {
		name: config.name,
		consume,
		async _resetForTesting(dbx: SchemaDatabase = defaultDb) {
			lastPruneAt = 0
			await dbx.delete(rateLimitBuckets).where(sql`${rateLimitBuckets.key} LIKE ${prefix + '%'}`)
		},
	}
}
