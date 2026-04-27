import { createLogger } from '@/lib/logger'

import { mergeWithinTier } from './merge'
import type {
	MergeContribution,
	OrchestrateOptions,
	OrchestrateResult,
	OrchestratorDeps,
	ProviderResponse,
	ScrapeAttempt,
	ScrapeContext,
	ScrapeErrorCode,
	ScrapeProvider,
	ScrapeResult,
} from './types'
import { ScrapeProviderError } from './types'

const baseLog = createLogger('scrape-orchestrator')

const DEFAULT_PER_PROVIDER_TIMEOUT_MS = 10_000
const DEFAULT_OVERALL_TIMEOUT_MS = 20_000
const DEFAULT_QUALITY_THRESHOLD = 3

export async function orchestrate(options: OrchestrateOptions, deps: OrchestratorDeps): Promise<OrchestrateResult> {
	const log = baseLog.child({ url: options.url, itemId: options.itemId ?? null })
	const emit = deps.emit ?? (() => {})
	const perProviderTimeoutMs = deps.perProviderTimeoutMs ?? DEFAULT_PER_PROVIDER_TIMEOUT_MS
	const overallTimeoutMs = deps.overallTimeoutMs ?? DEFAULT_OVERALL_TIMEOUT_MS
	const qualityThreshold = deps.qualityThreshold ?? DEFAULT_QUALITY_THRESHOLD
	const mergeFn = deps.mergeFn ?? mergeWithinTier

	if (!isValidScrapeUrl(options.url)) {
		emit({ type: 'error', reason: 'invalid-url' })
		return { kind: 'error', reason: 'invalid-url', attempts: [] }
	}

	// Cache lookup. Skip when force is set or no cache loader is wired in.
	const cacheHit = options.force ? null : ((await deps.loadCache?.(options.url)) ?? null)

	// Filter the registered providers to those available + matching the override.
	const candidates = await selectProviders(deps.providers, options.providerOverride)

	// Split into tiered providers (run in tier loop) and parallel racers
	// (always run alongside the tier loop regardless of threshold). The
	// `tier` field is undefined only for ai-provider in commit A; commit B
	// removes the parallel-racer mode entirely.
	const tieredProviders: Array<ScrapeProvider> = candidates.filter(p => typeof p.tier === 'number')
	const parallelRacers: Array<ScrapeProvider> = candidates.filter(p => typeof p.tier !== 'number')

	const tierGroups = groupByTier(tieredProviders)
	const tierOrder = [...tierGroups.keys()].sort((a, b) => a - b)

	const providerNames: Record<string, string> = {}
	for (const p of candidates) {
		if (p.name && p.name !== p.id) providerNames[p.id] = p.name
	}

	emit({
		type: 'plan',
		tiers: tierOrder.map(tier => ({ tier, providerIds: tierGroups.get(tier)!.map(p => p.id) })),
		parallelRacers: parallelRacers.map(p => p.id),
		providerNames,
		totalTimeoutMs: overallTimeoutMs,
		cached: cacheHit !== null,
	})

	if (cacheHit) {
		emit({ type: 'result_ready', result: cacheHit.result, fromProvider: cacheHit.fromProvider, cached: true })
		emit({ type: 'done', attempts: [] })
		return {
			kind: 'ok',
			result: cacheHit.result,
			fromProvider: cacheHit.fromProvider,
			attempts: [],
			cached: true,
		}
	}

	if (candidates.length === 0) {
		log.warn('no providers available')
		emit({ type: 'error', reason: 'no-providers-available' })
		return { kind: 'error', reason: 'no-providers-available', attempts: [] }
	}

	const overallController = new AbortController()
	const overallTimer = setTimeout(() => overallController.abort(new Error('overall timeout')), overallTimeoutMs)
	if (options.signal) {
		const external = options.signal
		if (external.aborted) {
			overallController.abort(external.reason)
		} else {
			external.addEventListener('abort', () => overallController.abort(external.reason), { once: true })
		}
	}

	const attempts: Array<ScrapeAttempt> = []
	type Winner = { result: ScrapeResult; fromProvider: string; score: number; scoreContext: { html?: string; status?: number } }
	const winnerRef: { current: Winner | null } = { current: null }

	// Each provider's success captures both its result and the score
	// context (so a tier merge can re-score with a representative html
	// body and status). Failures push attempts but produce no
	// MergeContribution.
	type ProviderRunResult =
		| { ok: true; result: ScrapeResult; score: number; scoreContext: { html?: string; status?: number }; providerId: string }
		| { ok: false; providerId: string }

	const runProvider = async (provider: ScrapeProvider): Promise<ProviderRunResult> => {
		emit({ type: 'attempt_started', providerId: provider.id })
		const start = Date.now()
		const perCtrl = new AbortController()
		const onAbort = () => perCtrl.abort(overallController.signal.reason)
		if (overallController.signal.aborted) {
			perCtrl.abort(overallController.signal.reason)
		} else {
			overallController.signal.addEventListener('abort', onAbort, { once: true })
		}
		const perTimer = setTimeout(() => perCtrl.abort(new Error('per-provider timeout')), perProviderTimeoutMs)

		const ctx: ScrapeContext = {
			url: options.url,
			signal: perCtrl.signal,
			logger: log.child({ provider: provider.id }),
			perAttemptTimeoutMs: perProviderTimeoutMs,
			acceptLanguage: options.acceptLanguage,
		}

		try {
			const response = await provider.fetch(ctx)
			const ms = Date.now() - start
			const { result, score, scoreContext } = evaluateResponse(response, deps)
			// Minimum-signal gate: a "successful" attempt must produce at
			// least a non-empty title. Without that, downstream UX has
			// nothing meaningful to show — a fetch that returns an empty
			// envelope or lands on a page where extraction whiffed
			// completely should be persisted as ok:false with errorCode
			// invalid_response, not as ok:true score:0. The catch branch
			// below handles persistence and emits attempt_failed.
			if (!hasMinimumSignal(result)) {
				throw new ScrapeProviderError('invalid_response', 'no usable fields extracted (title missing)')
			}
			const attempt: ScrapeAttempt = { providerId: provider.id, ok: true, score, ms }
			attempts.push(attempt)
			emit({ type: 'attempt_completed', providerId: provider.id, score, ms })
			await deps.persistAttempt?.({
				itemId: options.itemId,
				url: options.url,
				providerId: provider.id,
				ok: true,
				score,
				ms,
				result,
				rawResponse: response.kind === 'html' ? { kind: 'html', status: response.status, finalUrl: response.finalUrl } : response.result,
			})
			return { ok: true, result, score, scoreContext, providerId: provider.id }
		} catch (err) {
			const ms = Date.now() - start
			const { code, message } = classifyError(err)
			const attempt: ScrapeAttempt = { providerId: provider.id, ok: false, score: null, ms, errorCode: code, errorMessage: message }
			attempts.push(attempt)
			emit({ type: 'attempt_failed', providerId: provider.id, errorCode: code, errorMessage: message, ms })
			await deps.persistAttempt?.({
				itemId: options.itemId,
				url: options.url,
				providerId: provider.id,
				ok: false,
				score: null,
				ms,
				errorCode: code,
				errorMessage: message,
			})
			return { ok: false, providerId: provider.id }
		} finally {
			clearTimeout(perTimer)
			overallController.signal.removeEventListener('abort', onAbort)
		}
	}

	const considerWinner = (candidate: Winner): void => {
		const current = winnerRef.current
		if (current === null) {
			winnerRef.current = candidate
			emit({ type: 'result_ready', result: candidate.result, fromProvider: candidate.fromProvider, cached: false })
			return
		}
		if (candidate.score > current.score) {
			winnerRef.current = candidate
			emit({ type: 'result_updated', result: candidate.result, fromProvider: candidate.fromProvider })
		}
	}

	// Kick off the always-on parallel racers concurrently with the tier
	// loop. They keep firing regardless of whether tier 1 wins; their
	// results compete with the tier-loop winner via `considerWinner`.
	const racerPromises = parallelRacers.map(p =>
		runProvider(p).then(res => {
			if (res.ok) {
				considerWinner({ result: res.result, fromProvider: res.providerId, score: res.score, scoreContext: res.scoreContext })
			}
		})
	)

	// Tier loop. Each tier fires all its providers in parallel, waits for
	// settle, merges the successes, re-scores the merge, and only advances
	// to the next tier when the merged score is below qualityThreshold.
	const reachedTiers = new Set<number>()
	try {
		for (const tier of tierOrder) {
			if (overallController.signal.aborted) break

			const tierProviders = tierGroups.get(tier)!
			emit({ type: 'tier_started', tier, providerIds: tierProviders.map(p => p.id) })
			reachedTiers.add(tier)

			const settled = await Promise.allSettled(tierProviders.map(runProvider))
			const successes: Array<MergeContribution & { scoreContext: { html?: string; status?: number } }> = []
			for (const s of settled) {
				if (s.status !== 'fulfilled') continue
				const r = s.value
				if (!r.ok) continue
				successes.push({
					result: r.result,
					fromProvider: r.providerId,
					score: r.score,
					scoreContext: r.scoreContext,
				})
			}

			if (successes.length === 0) {
				emit({ type: 'tier_completed', tier, mergedScore: null, contributors: [], cleared: false })
				continue
			}

			// Merge succeeded contributions, then re-score the merged
			// result. Use the highest-scoring contributor's score context
			// for the re-score (best signal for the bot-block penalty).
			const merged = mergeFn(successes.map(s => ({ result: s.result, fromProvider: s.fromProvider, score: s.score })))
			const scoreContext = pickBestScoreContext(successes)
			const mergedScore = deps.scoreFn(merged.result, scoreContext)

			const contributorIds = mergedFromProviderToContributors(merged.fromProvider)
			const cleared = mergedScore >= qualityThreshold

			considerWinner({
				result: merged.result,
				fromProvider: merged.fromProvider,
				score: mergedScore,
				scoreContext,
			})

			emit({ type: 'tier_completed', tier, mergedScore, contributors: contributorIds, cleared })

			if (cleared) break
		}

		// Emit tier_skipped for any tier we never reached.
		for (const tier of tierOrder) {
			if (!reachedTiers.has(tier)) {
				emit({ type: 'tier_skipped', tier, reason: 'previous_tier_won' })
			}
		}

		// Wait for parallel racers so their attempts persist and a late
		// higher-scoring racer can still take the win.
		await Promise.allSettled(racerPromises)
	} finally {
		clearTimeout(overallTimer)
	}

	// Run any post-pass (e.g. AI title cleanup) on the final winner.
	const postPass = deps.postProcessResult
	const beforePost = winnerRef.current
	if (postPass && beforePost) {
		try {
			const next = await postPass(beforePost.result, { url: options.url, fromProvider: beforePost.fromProvider })
			if (next !== beforePost.result) {
				winnerRef.current = { ...beforePost, result: next }
				emit({ type: 'result_updated', result: next, fromProvider: beforePost.fromProvider })
			}
		} catch (err) {
			log.warn({ err }, 'post-pass threw; keeping un-processed result')
		}
	}

	const final = winnerRef.current
	if (final) {
		emit({ type: 'done', attempts })
		return {
			kind: 'ok',
			result: final.result,
			fromProvider: final.fromProvider,
			attempts,
			cached: false,
		}
	}

	if (overallController.signal.aborted) {
		emit({ type: 'error', reason: 'timeout' })
		return { kind: 'error', reason: 'timeout', attempts }
	}

	emit({ type: 'error', reason: 'all-providers-failed' })
	return { kind: 'error', reason: 'all-providers-failed', attempts }
}

// Minimum-signal gate. A scraped result is only "successful" if it carries
// at least a non-empty title — anything less has nothing useful to show
// the user, regardless of how the scoring function felt about other
// fields. Cheaper than the score function and intentionally separate:
// score is for ranking, this is for valid/invalid.
function hasMinimumSignal(result: ScrapeResult): boolean {
	return typeof result.title === 'string' && result.title.trim().length > 0
}

function isValidScrapeUrl(raw: string): boolean {
	try {
		const u = new URL(raw)
		return u.protocol === 'http:' || u.protocol === 'https:'
	} catch {
		return false
	}
}

async function selectProviders(providers: Array<ScrapeProvider>, override: Array<string> | undefined): Promise<Array<ScrapeProvider>> {
	const byId = new Map(providers.map(p => [p.id, p]))
	const ordered: Array<ScrapeProvider> = override
		? override.flatMap(id => {
				const found = byId.get(id)
				return found ? [found] : []
			})
		: providers
	const checks = await Promise.all(ordered.map(async p => ({ p, ok: (await p.isAvailable()) === true })))
	return checks.filter(({ ok }) => ok).map(({ p }) => p)
}

function groupByTier(providers: Array<ScrapeProvider>): Map<number, Array<ScrapeProvider>> {
	const out = new Map<number, Array<ScrapeProvider>>()
	for (const p of providers) {
		const tier = p.tier!
		const list = out.get(tier) ?? []
		list.push(p)
		out.set(tier, list)
	}
	return out
}

function pickBestScoreContext(contributions: ReadonlyArray<{ score: number; scoreContext: { html?: string; status?: number } }>): {
	html?: string
	status?: number
} {
	let best = contributions[0]
	for (const c of contributions) if (c.score > best.score) best = c
	return best.scoreContext
}

function mergedFromProviderToContributors(fromProvider: string): Array<string> {
	if (fromProvider.startsWith('merged:')) {
		return fromProvider.slice('merged:'.length).split(',').filter(Boolean)
	}
	return [fromProvider]
}

function evaluateResponse(
	response: ProviderResponse,
	deps: OrchestratorDeps
): { result: ScrapeResult; score: number; scoreContext: { html?: string; status?: number } } {
	if (response.kind === 'html') {
		const result = deps.extractFromRaw(response.html, response.finalUrl)
		const scoreContext = { html: response.html, status: response.status }
		const score = deps.scoreFn(result, scoreContext)
		return { result, score, scoreContext }
	}
	const score = deps.scoreFn(response.result, {})
	return { result: response.result, score, scoreContext: {} }
}

function classifyError(err: unknown): { code: ScrapeErrorCode; message?: string } {
	if (err instanceof ScrapeProviderError) {
		return { code: err.code, message: err.message }
	}
	if (err instanceof Error) {
		// AbortError surfaces as DOMException in newer runtimes; check name.
		if (err.name === 'AbortError' || /timeout|aborted/i.test(err.message)) {
			return { code: 'timeout', message: err.message }
		}
		return { code: 'unknown', message: err.message }
	}
	return { code: 'unknown' }
}
