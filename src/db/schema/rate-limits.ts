import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// =====================================================================
// RATE LIMIT BUCKETS (shared fixed-window counters)
// =====================================================================
//
// Backing store for limiters that must hold across instances. The
// in-memory limiter in `src/lib/rate-limit.ts` is per-process, so on a
// serverless or horizontally-scaled deploy each instance and each cold
// start hands out a fresh budget. That is tolerable for cost-shaping
// limiters (scrape, claim, comment) but not for credential endpoints,
// where the limiter is the brute-force defense. See sec-review S1.
//
// One row per limiter key ("<limiter>:ip:1.2.3.4"). Rows are rewritten
// in place by an atomic upsert; expired rows are pruned opportunistically
// by the limiter itself, so no cron wiring is required.

export const rateLimitBuckets = pgTable('rate_limit_buckets', {
	key: text('key').primaryKey(),
	count: integer('count').notNull(),
	windowStart: timestamp('window_start', { withTimezone: true }).defaultNow().notNull(),
})

export type RateLimitBucket = typeof rateLimitBuckets.$inferSelect
