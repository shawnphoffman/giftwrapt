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
	// `html` providers go through the extractor; `structured` providers don't.
	readonly kind: 'html' | 'structured'
	// `sequential` providers join the priority chain and gate on score-based
	// fallthrough. `parallel` providers fire alongside the chain and only
	// compete via final scoring.
	readonly mode: 'sequential' | 'parallel'
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
	| { type: 'plan'; sequential: Array<string>; parallel: Array<string>; totalTimeoutMs: number; cached: boolean }
	| { type: 'attempt_started'; providerId: string }
	| { type: 'attempt_completed'; providerId: string; score: number; ms: number }
	| { type: 'attempt_failed'; providerId: string; errorCode: ScrapeErrorCode; errorMessage?: string; ms: number }
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
}
