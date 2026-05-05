import type { Logger } from 'pino'
import { z } from 'zod'

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
})

export type ScrapeResult = z.infer<typeof scrapeResultSchema>

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
	// threshold. Used by `ai-provider` in commit A; in commit B `ai-provider`
	// becomes a regular tiered entry and parallel-racer mode goes away.
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
			// providers in parallel, then merges results, then advances to the
			// next tier only if the merge fell below qualityThreshold.
			tiers: Array<{ tier: number; providerIds: Array<string> }>
			// Always-on parallel racers (currently just `ai-provider` in
			// commit A; empty in commit B once it migrates).
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
			// Always 'previous_tier_won' today; left as a discriminator for
			// future reasons (e.g. 'no_providers_available', 'aborted').
			reason: 'previous_tier_won'
	  }
	| { type: 'result_ready'; result: ScrapeResult; fromProvider: string; cached: boolean }
	| { type: 'result_updated'; result: ScrapeResult; fromProvider: string }
	| { type: 'done'; attempts: Array<ScrapeAttempt> }
	| { type: 'error'; reason: OrchestrateErrorReason }

export type OrchestrateEmitter = (event: StreamEvent) => void

// ===========================================================================
// Orchestrator IO
// ===========================================================================

export type OrchestrateErrorReason = 'all-providers-failed' | 'invalid-url' | 'not-authorized' | 'timeout' | 'no-providers-available'

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
	// Optional merge function used to combine multiple succeeded results
	// within a tier into a single fill-the-gaps result. Defaults to the
	// shipped `mergeWithinTier` from `lib/scrapers/merge.ts`; tests inject
	// their own to assert behavior in isolation.
	mergeFn?: (contributions: Array<MergeContribution>) => MergedResult
}

// Inputs to `mergeFn`. Each contribution is one provider's successful
// attempt within a tier; the orchestrator hands them in score-descending
// order so the merge function can use index 0 as the base.
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
