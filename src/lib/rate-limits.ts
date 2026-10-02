// Centralized registry of rate-limiter instances. See sec-review H2.
//
// Each named limiter is created once at module load and shared across
// every call site. Tuning notes per limiter live next to the
// declaration so the limits are easy to find, audit, and adjust.

import { createRateLimiter } from './rate-limit'
import { createDbRateLimiter } from './rate-limit-db'

// Comment writes per user. Posting a comment is cheap server-side but
// triggers an outbound transactional email per recipient (when
// configured), so the cost is asymmetric. 30/min is well above any
// realistic human cadence.
export const commentLimiter = createRateLimiter({
	name: 'comments',
	max: 30,
	windowMs: 60_000,
})

// Manual Intelligence refresh per user. Each call fans out to multiple
// AI provider invocations (one per analyzer per affected list), so the
// cost per call is high. 5/hour is plenty for "I just changed something
// and want fresh recs" while still bounding runaway abuse. Long window
// matches the human "wait and look again" cadence; the more granular
// admin-configurable cooldown lives in `intelligenceManualRefreshCooldownMinutes`.
export const intelligenceRefreshLimiter = createRateLimiter({
	name: 'intelligence-refresh',
	max: 5,
	windowMs: 60 * 60_000,
})

// Claim / unclaim / update mutations per user. These are SQL-only but
// fire SSE events to every connected client; rapid toggling is annoying
// to other viewers.
export const claimLimiter = createRateLimiter({
	name: 'claims',
	max: 60,
	windowMs: 60_000,
})

// URL scrape requests. Each scrape can fan out to multiple paid
// providers (Browserbase, ScrapFly) and an LLM call. Per-user keying
// since the route requires auth.
export const scrapeLimiter = createRateLimiter({
	name: 'scrape',
	max: 20,
	windowMs: 60_000,
})

// Barcode product lookups per user. Each lookup may call a paid
// provider (Go-UPC) and, with the fallback enabled, also the URL
// scrape pipeline; a tight bound here doubles as a downstream cost
// cap. 30/min/user is comfortably above a real human scanning items.
// Gift suggestions per user. Each request is one model call over another
// person's lists; 10 an hour covers browsing a few people before a
// holiday without letting a stuck client run up a bill.
export const giftSuggestionsLimiter = createRateLimiter({
	name: 'gift-suggestions',
	max: 10,
	windowMs: 60 * 60_000,
})

export const barcodeLookupLimiter = createRateLimiter({
	name: 'barcode-lookup',
	max: 30,
	windowMs: 60_000,
})

// File proxy reads. Per-IP since the proxy doesn't require auth (the
// nonce-based object keys are the access control). Generous: image
// pages with N items will fire N requests in burst.
export const fileProxyLimiter = createRateLimiter({
	name: 'files',
	max: 300,
	windowMs: 60_000,
})

// Mobile sign-in attempts. Per-IP since this endpoint runs before any
// session exists. 10/min/IP keeps brute-force unattractive while
// still letting a user with a fat-fingered password retry comfortably.
// See `src/server/mobile-api/v1.ts` (`POST /v1/sign-in`).
//
// DB-backed, unlike every limiter above: this one guards credentials, and
// `POST /v1/sign-in` validates them by calling `auth.api.signInEmail()`
// programmatically, which bypasses better-auth's own (database-backed)
// HTTP rate limiter. An in-memory counter would reset on every cold start
// and be per-instance on a scaled deploy, which is exactly the budget a
// brute-force wants. The limiters above shape cost rather than guard
// secrets, so per-instance counting remains acceptable for them.
// See sec-review S1.
export const mobileSignInLimiter = createDbRateLimiter({
	name: 'mobile-sign-in',
	max: 10,
	windowMs: 60_000,
})

// MCP tool calls per user across every connected AI client. Cost shaping
// (each call is a DB round-trip or a scrape); the security controls are
// the OAuth token and the enableMcp switch. Database-backed so the
// per-user budget is one budget: on a serverless deploy every instance
// would otherwise hand out its own 120, and an assistant fanning out
// tool calls lands on many instances at once. One upsert per call is
// cheap next to the call itself. Scrape-backed tools also consume
// `scrapeLimiter` (in-memory, shared with the web routes) so they cannot
// sidestep the web cap.
export const mcpLimiter = createDbRateLimiter({
	name: 'mcp',
	max: 120,
	windowMs: 60_000,
})
