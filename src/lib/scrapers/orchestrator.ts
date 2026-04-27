import { createLogger } from '@/lib/logger'

import type {
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

	if (!isValidScrapeUrl(options.url)) {
		emit({ type: 'error', reason: 'invalid-url' })
		return { kind: 'error', reason: 'invalid-url', attempts: [] }
	}

	// Cache lookup. Skip when force is set or no cache loader is wired in.
	const cacheHit = options.force ? null : ((await deps.loadCache?.(options.url)) ?? null)

	// Filter the registered providers to those available + matching the override
	// (if provided). Honours order in `providerOverride`; otherwise preserves
	// registration order.
	const candidates = await selectProviders(deps.providers, options.providerOverride)
	const sequential = candidates.filter(p => p.mode === 'sequential')
	const parallel = candidates.filter(p => p.mode === 'parallel')

	const providerNames: Record<string, string> = {}
	for (const p of candidates) {
		if (p.name && p.name !== p.id) providerNames[p.id] = p.name
	}

	emit({
		type: 'plan',
		sequential: sequential.map(p => p.id),
		parallel: parallel.map(p => p.id),
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
	type Winner = { result: ScrapeResult; fromProvider: string; score: number }
	// Wrapped in an object so TypeScript's control-flow analysis doesn't narrow
	// the field to its initial value across closure invocations.
	const winnerRef: { current: Winner | null } = { current: null }

	const runProvider = async (provider: ScrapeProvider): Promise<void> => {
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
			const { result, score } = evaluateResponse(response, deps)
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
			considerWinner({ result, fromProvider: provider.id, score })
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

	// Kick off parallel providers immediately; do not await yet.
	const parallelPromises = parallel.map(runProvider)

	// Sequential chain: stop early once a result clears the quality threshold
	// (the user is unblocked at that point; remaining providers in the chain
	// are skipped). Parallels still get to finish.
	try {
		for (const provider of sequential) {
			if (overallController.signal.aborted) break
			await runProvider(provider)
			const current = winnerRef.current
			if (current && current.score >= qualityThreshold) break
		}
		// Wait for parallels to wrap up so their attempts persist and a late
		// higher-scoring parallel can still take the win.
		await Promise.allSettled(parallelPromises)
	} finally {
		clearTimeout(overallTimer)
	}

	// Run any post-pass (e.g. AI title cleanup) on the final winner. We
	// catch and swallow errors here on purpose: a flaky LLM should not
	// invalidate a successful scrape.
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

function evaluateResponse(response: ProviderResponse, deps: OrchestratorDeps): { result: ScrapeResult; score: number } {
	if (response.kind === 'html') {
		const result = deps.extractFromRaw(response.html, response.finalUrl)
		const score = deps.scoreFn(result, { html: response.html, status: response.status })
		return { result, score }
	}
	const score = deps.scoreFn(response.result, {})
	return { result: response.result, score }
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
