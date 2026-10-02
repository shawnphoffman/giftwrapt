import type { Logger } from 'pino'
import { z } from 'zod'

import type { ScoreBreakdown } from './score'

// ===========================================================================
// Scrape result (the user-visible structured data)
// ===========================================================================
//
// Shared across providers, the extractor, and the API surface. The fields here
// align with `itemScrapes` columns. Validated by zod so structured-result
// providers (AI, custom-http json) can hand us anything resembling the shape
// and we coerce + drop unknown fields safely.

export const scrapeResultSchema = z.object({
	title: z.string().optional(),
	description: z.string().optional(),
	price: z.string().optional(),
	currency: z.string().optional(),
	imageUrls: z.array(z.string()).default([]),
	siteName: z.string().optional(),
	finalUrl: z.string().optional(),
	// Aggregate review rating, normalized to a 0..1 scale. e.g. 4.2 of 5
	// stars becomes 0.84. Extractors are responsible for normalizing
	// against `bestRating` (Schema.org) or the well-known scale of the
	// host site (Amazon = 5). Absent when the page doesn't surface one.
	ratingValue: z.number().min(0).max(1).optional(),
	// Number of ratings/reviews behind ratingValue. Used by analyzers to
	// avoid acting on tiny samples. Absent when the page doesn't expose it.
	ratingCount: z.number().int().nonnegative().optional(),
	// Names of purchase-choice axes the buyer must pick (e.g. "Color",
	// "Size"). Just the axis names, not their values. Drives the notes
	// prefill so the recipient is prompted to capture their choice.
	// Optional: layers that don't surface axes leave it undefined.
	purchaseVariants: z.array(z.string()).optional(),
})

export type ScrapeResult = z.infer<typeof scrapeResultSchema>

// Model-facing variant of scrapeResultSchema. Identical in shape, but
// without the `min`/`max`/`int` constraints on the numeric fields.
//
// Some structured-output APIs reject those constraints in the converted
// JSON schema — notably Gemini (including via OpenAI-compatible base
// URLs) returns:
//   `output_config.format.schema: For 'number' type, properties maximum,
//    minimum are not supported`
//
// when the schema includes `minimum`/`maximum` on a `number`. We send
// the loosened version to the model and run `coerceScrapeResult` on the
// output to enforce the real bounds (dropping out-of-range values
// rather than failing the whole extraction over a hallucinated rating).
export const scrapeResultModelSchema = z.object({
	title: z.string().optional(),
	description: z.string().optional(),
	price: z.string().optional(),
	currency: z.string().optional(),
	imageUrls: z.array(z.string()).default([]),
	siteName: z.string().optional(),
	finalUrl: z.string().optional(),
	ratingValue: z.number().optional(),
	ratingCount: z.number().optional(),
	purchaseVariants: z.array(z.string()).optional(),
})

export type ScrapeResultModel = z.infer<typeof scrapeResultModelSchema>

/**
 * Coerce a model-emitted result into the strict `scrapeResultSchema`:
 * - `ratingValue` outside [0, 1] is dropped (the model occasionally
 *   returns the raw N-of-5 instead of the normalized fraction; a dropped
 *   rating is better than a failed extraction).
 * - `ratingCount` is floored to an integer; negatives are dropped.
 *
 * Other fields pass through unchanged. Throws via `scrapeResultSchema.parse`
 * if the input is fundamentally the wrong shape.
 */
export function coerceScrapeResult(input: ScrapeResultModel): ScrapeResult {
	const ratingValue =
		typeof input.ratingValue === 'number' && input.ratingValue >= 0 && input.ratingValue <= 1 ? input.ratingValue : undefined
	const ratingCount = typeof input.ratingCount === 'number' && input.ratingCount >= 0 ? Math.floor(input.ratingCount) : undefined
	return scrapeResultSchema.parse({
		...input,
		ratingValue,
		ratingCount,
	})
}

// ===========================================================================
// Provider responses
// ===========================================================================
//
// `html` providers return raw page contents for the shared extractor to parse.
// `structured` providers (AI, custom-http json) hand us a ScrapeResult
// directly, skipping the extractor.

export type RawPage = {
	kind: 'html'
	providerId: string
	html: string
	finalUrl: string
	status: number
	headers: Record<string, string>
	fetchMs: number
}

export type StructuredResponse = {
	kind: 'structured'
	providerId: string
	result: ScrapeResult
	fetchMs: number
}

export type ProviderResponse = RawPage | StructuredResponse

// ===========================================================================
// Errors
// ===========================================================================

export type ScrapeErrorCode =
	| 'bot_block'
	| 'http_4xx'
	| 'http_5xx'
	| 'network_error'
	| 'timeout'
	| 'invalid_response'
	| 'config_missing'
	// The page redirected to the store's homepage: the product is gone.
	| 'dead_link'
	| 'unknown'

export class ScrapeProviderError extends Error {
	readonly code: ScrapeErrorCode
	constructor(code: ScrapeErrorCode, message?: string) {
		super(message ?? code)
		this.name = 'ScrapeProviderError'
		this.code = code
	}
}

// ===========================================================================
// Provider interface
// ===========================================================================

export type ScrapeContext = {
	url: string
	signal: AbortSignal
	logger: Logger
	perAttemptTimeoutMs: number
	// Optional headers the orchestrator passes through (e.g. user Accept-Language).
	acceptLanguage?: string
}

export type ScrapeProvider = {
	readonly id: string
	// Optional human-friendly display label for the streaming UX. Built-in
	// providers can leave this off (their id is already a clean string);
	// configurable providers (custom-http, etc.) should set it to whatever
	// the admin typed in. The orchestrator emits id+name pairs in the
	// `plan` event so clients can resolve `from-provider:<id>` references
	// to the label without a round-trip.
	readonly name?: string
	// `html` providers go through the extractor; `structured` providers don't.
	readonly kind: 'html' | 'structured'
	// Tier determines when this provider runs in the orchestrator. Tier 0
	// is reserved for the always-on `fetch-provider`; tiers 1-5 are
	// admin-configurable. When `tier` is undefined, the provider runs as a
	// "parallel racer" alongside the tier loop and always contributes its
	// result regardless of whether the tier loop already cleared the
	// threshold. No shipped provider type uses racer mode today; AI and
	// Stagehand are regular tiered entries.
	readonly tier?: number
	// Optional per-provider override for the orchestrator's per-attempt
	// timeout. Undefined means the orchestrator falls back to its
	// `perProviderTimeoutMs` dep (which itself defaults to the global
	// `scrapeProviderTimeoutMs` setting).
	readonly timeoutMs?: number
	// Cheap availability check the orchestrator runs at chain assembly time.
	// Lets a provider exclude itself when its env / config is missing without
	// throwing later.
	readonly isAvailable: () => boolean | Promise<boolean>
	readonly fetch: (ctx: ScrapeContext) => Promise<ProviderResponse>
}

// ===========================================================================
// Attempts (persisted + surfaced via streaming UX)
// ===========================================================================

export type ScrapeAttempt = {
	providerId: string
	ok: boolean
	score: number | null
	ms: number
	errorCode?: ScrapeErrorCode
	errorMessage?: string
}

// ===========================================================================
// Streaming event wire format
// ===========================================================================

export type StreamEvent =
	| {
			type: 'plan'
			// Provider ids grouped by tier. The orchestrator runs each tier's
			// providers in parallel, folds the results into one running merge
			// across all tiers, and advances to the next tier only while that
			// merge is below qualityThreshold.
			tiers: Array<{ tier: number; providerIds: Array<string> }>
			// Providers with no tier, run alongside the tier loop. Empty for
			// every shipped provider type.
			parallelRacers: Array<string>
			// Human-friendly label per provider id. Clients fall back to the id
			// when a name isn't supplied. Custom-http entries always include
			// their admin-assigned name; built-ins can leave their entries off.
			providerNames: Record<string, string>
			totalTimeoutMs: number
			cached: boolean
	  }
	| { type: 'attempt_started'; providerId: string }
	| { type: 'attempt_completed'; providerId: string; score: number; ms: number }
	| { type: 'attempt_failed'; providerId: string; errorCode: ScrapeErrorCode; errorMessage?: string; ms: number }
	| {
			type: 'tier_started'
			tier: number
			providerIds: Array<string>
	  }
	| {
			type: 'tier_completed'
			tier: number
			// The merged result's score after fill-the-gaps merging across all
			// tier providers that succeeded. Null when every provider in the
			// tier failed (no merge was possible).
			mergedScore: number | null
			// Provider ids that contributed at least one field to the merged
			// result. Empty when no provider in the tier succeeded.
			contributors: Array<string>
			// True when this tier's merged score cleared qualityThreshold and
			// stopped the tier loop. False when we either advanced to a later
			// tier or no later tier existed.
			cleared: boolean
	  }
	| {
			type: 'tier_skipped'
			tier: number
			// 'previous_tier_won', or 'dead_link' when an earlier tier found the
			// link redirects to the store's homepage. Left as a discriminator for
			// future reasons (e.g. 'no_providers_available', 'aborted').
			reason: 'previous_tier_won' | 'dead_link'
	  }
	| { type: 'result_ready'; result: ScrapeResult; fromProvider: string; cached: boolean }
	| { type: 'result_updated'; result: ScrapeResult; fromProvider: string }
	| { type: 'done'; attempts: Array<ScrapeAttempt> }
	| { type: 'error'; reason: OrchestrateErrorReason }

export type OrchestrateEmitter = (event: StreamEvent) => void

// ===========================================================================
// Orchestrator IO
// ===========================================================================

export type OrchestrateErrorReason =
	| 'all-providers-failed'
	| 'invalid-url'
	| 'not-authorized'
	| 'timeout'
	| 'no-providers-available'
	| 'dead-link'

export type OrchestrateOptions = {
	url: string
	itemId?: number
	force?: boolean
	providerOverride?: Array<string>
	acceptLanguage?: string
	// External abort signal (e.g. the SSE route hands over `request.signal`).
	// When this fires the overall budget aborts immediately and the
	// orchestrator returns with `reason: 'timeout'`.
	signal?: AbortSignal
}

export type OrchestrateResult =
	| {
			kind: 'ok'
			result: ScrapeResult
			fromProvider: string
			attempts: Array<ScrapeAttempt>
			cached: boolean
	  }
	| {
			kind: 'error'
			reason: OrchestrateErrorReason
			attempts: Array<ScrapeAttempt>
	  }

// Pluggable surfaces, kept as injection points so commit 1 can ship a tested
// orchestrator without depending on the extractor (commit 2), scoring (commit
// 3), fetch-provider (commit 4), or DB cache (commit 5).
export type OrchestratorDeps = {
	providers: Array<ScrapeProvider>
	// Returns the structured result for a raw HTML page. Implemented by the
	// extractor in commit 2.
	extractFromRaw: (html: string, finalUrl: string) => ScrapeResult
	// Returns a number; the orchestrator compares against `qualityThreshold`
	// to decide fall-through. Implemented in commit 3.
	scoreFn: (result: ScrapeResult, ctx: { html?: string; status?: number }) => number
	// Optional per-signal itemization of the same score, persisted with each
	// successful attempt so the admin Scrape History can show why it scored what it did.
	explainScore?: (result: ScrapeResult, ctx: { html?: string; status?: number }) => ScoreBreakdown
	// Optional cache lookup. Returning a hit short-circuits the chain.
	loadCache?: (url: string) => Promise<{ result: ScrapeResult; fromProvider: string } | null>
	// Optional persistence hook for each attempt + final winner.
	persistAttempt?: (record: {
		itemId?: number
		url: string
		providerId: string
		ok: boolean
		score: number | null
		ms: number
		errorCode?: ScrapeErrorCode
		errorMessage?: string
		result?: ScrapeResult
		rawResponse?: unknown
		scoreParts?: ScoreBreakdown['parts']
	}) => Promise<void>
	emit?: OrchestrateEmitter
	perProviderTimeoutMs?: number
	overallTimeoutMs?: number
	qualityThreshold?: number
	// Optional post-processing on the final winning result, run after all
	// providers have settled and before the orchestrator emits `done`. Used
	// for the AI title-cleanup pass; failures are swallowed so a flaky LLM
	// can't blow up an otherwise-successful scrape.
	postProcessResult?: (result: ScrapeResult, ctx: { url: string; fromProvider: string }) => Promise<ScrapeResult>
	// Optional merge function used to combine succeeded results into a
	// single fill-the-gaps result. The orchestrator keeps one running merge
	// across every tier and racer. Defaults to the shipped `mergeContributions`
	// from `lib/scrapers/merge.ts`; tests inject their own to assert
	// behavior in isolation.
	mergeFn?: (contributions: Array<MergeContribution>) => MergedResult
	// Optional consistency guard: may `candidate` fill gaps in a merge whose
	// base is `base`? Defaults to `isSameProduct` from
	// `lib/scrapers/same-product.ts`.
	sameProduct?: (base: ScrapeResult, candidate: ScrapeResult) => { ok: true } | { ok: false; reason: string }
	// Optional persistence hook for the final merged result, called once per
	// non-cached successful run after the post-pass. `result` is the merge
	// before the post-pass, `finalResult` after it (e.g. with a cleaned
	// title). The cache reads these rows.
	persistFinal?: (record: FinalScrapeRecord) => Promise<void>
}

export type FinalScrapeRecord = {
	itemId?: number
	url: string
	fromProvider: string
	score: number
	ms: number
	result: ScrapeResult
	finalResult: ScrapeResult
	scoreParts?: ScoreBreakdown['parts']
	// Providers whose results joined the merge, in score order.
	contributors: Array<string>
	// Successful providers the consistency guard kept out of the merge.
	rejected: Array<{ providerId: string; reason: string }>
}

// Inputs to `mergeFn`. Each contribution is one provider's successful
// attempt (from any tier or racer) that passed the consistency guard;
// the merge function sorts by score and uses the highest as the base.
export type MergeContribution = {
	result: ScrapeResult
	fromProvider: string
	score: number
}

export type MergedResult = {
	result: ScrapeResult
	// Single provider id when only one contributed; `merged:a,b,c` when
	// multiple providers contributed a non-empty field to the result.
	fromProvider: string
}
