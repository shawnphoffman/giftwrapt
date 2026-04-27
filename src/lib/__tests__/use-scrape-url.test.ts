import { describe, expect, it } from 'vitest'

import type { StreamEvent } from '../scrapers/types'
import { reduce, type ScrapeUiState } from '../use-scrape-url'

const initial: ScrapeUiState = { phase: 'idle', providers: [], providerNames: {}, elapsedMs: 0 }

function applyAll(events: ReadonlyArray<StreamEvent>): ScrapeUiState {
	let state: ScrapeUiState = initial
	for (const e of events) state = reduce(state, e)
	return state
}

describe('useScrapeUrl reducer: plan event', () => {
	it('initialises providers as pending and transitions idle → scraping', () => {
		const next = reduce(initial, {
			type: 'plan',
			sequential: ['fetch-provider', 'browserless-provider'],
			parallel: ['ai-provider'],
			providerNames: {},
			totalTimeoutMs: 20_000,
			cached: false,
		})
		expect(next.phase).toBe('scraping')
		expect(next.totalTimeoutMs).toBe(20_000)
		expect(next.providers).toEqual([
			{ providerId: 'fetch-provider', status: 'pending' },
			{ providerId: 'browserless-provider', status: 'pending' },
			{ providerId: 'ai-provider', status: 'pending' },
		])
	})

	it('captures provider display names from the plan event', () => {
		const next = reduce(initial, {
			type: 'plan',
			sequential: ['fetch-provider', 'custom-http:abc'],
			parallel: ['custom-http:def'],
			providerNames: { 'custom-http:abc': 'My Amazon scraper', 'custom-http:def': 'Etsy fallback' },
			totalTimeoutMs: 20_000,
			cached: false,
		})
		expect(next.providerNames).toEqual({
			'custom-http:abc': 'My Amazon scraper',
			'custom-http:def': 'Etsy fallback',
		})
	})
})

describe('useScrapeUrl reducer: attempt lifecycle', () => {
	it('attempt_started flips a row to in_progress', () => {
		const after = applyAll([
			{ type: 'plan', sequential: ['fetch-provider'], parallel: [], providerNames: {}, totalTimeoutMs: 20_000, cached: false },
			{ type: 'attempt_started', providerId: 'fetch-provider' },
		])
		expect(after.providers[0]).toEqual({ providerId: 'fetch-provider', status: 'in_progress' })
	})

	it('attempt_completed records score and ms', () => {
		const after = applyAll([
			{ type: 'plan', sequential: ['fetch-provider'], parallel: [], providerNames: {}, totalTimeoutMs: 20_000, cached: false },
			{ type: 'attempt_started', providerId: 'fetch-provider' },
			{ type: 'attempt_completed', providerId: 'fetch-provider', score: 6, ms: 423 },
		])
		expect(after.providers[0]).toEqual({ providerId: 'fetch-provider', status: 'done', score: 6, ms: 423 })
	})

	it('attempt_failed records errorCode and ms', () => {
		const after = applyAll([
			{ type: 'plan', sequential: ['fetch-provider'], parallel: [], providerNames: {}, totalTimeoutMs: 20_000, cached: false },
			{ type: 'attempt_failed', providerId: 'fetch-provider', errorCode: 'timeout', ms: 10_000 },
		])
		expect(after.providers[0]).toEqual({ providerId: 'fetch-provider', status: 'failed', errorCode: 'timeout', ms: 10_000 })
	})

	it("handles attempt events for a provider that wasn't in the plan", () => {
		// The orchestrator could emit an attempt for an ad-hoc provider not in
		// the original plan (custom-http config change mid-flight, etc.). We
		// upsert rather than crash.
		const after = applyAll([
			{ type: 'plan', sequential: [], parallel: [], providerNames: {}, totalTimeoutMs: 20_000, cached: false },
			{ type: 'attempt_started', providerId: 'late-comer' },
			{ type: 'attempt_completed', providerId: 'late-comer', score: 3, ms: 100 },
		])
		expect(after.providers).toHaveLength(1)
		expect(after.providers[0]?.providerId).toBe('late-comer')
		expect(after.providers[0]?.status).toBe('done')
	})
})

describe('useScrapeUrl reducer: results and termination', () => {
	it('result_ready moves the phase to partial', () => {
		const after = applyAll([
			{ type: 'plan', sequential: ['fetch-provider'], parallel: [], providerNames: {}, totalTimeoutMs: 20_000, cached: false },
			{ type: 'result_ready', result: { title: 'X', imageUrls: [] }, fromProvider: 'fetch-provider', cached: false },
		])
		expect(after.phase).toBe('partial')
		expect(after.result?.title).toBe('X')
		expect(after.fromProvider).toBe('fetch-provider')
		expect(after.cached).toBe(false)
	})

	it('result_updated swaps the result without changing phase', () => {
		const after = applyAll([
			{ type: 'plan', sequential: ['seq'], parallel: ['par'], providerNames: {}, totalTimeoutMs: 20_000, cached: false },
			{ type: 'result_ready', result: { title: 'first', imageUrls: [] }, fromProvider: 'seq', cached: false },
			{ type: 'result_updated', result: { title: 'better', imageUrls: [] }, fromProvider: 'par' },
		])
		expect(after.phase).toBe('partial')
		expect(after.result?.title).toBe('better')
		expect(after.fromProvider).toBe('par')
	})

	it('done after a result_ready transitions to done', () => {
		const after = applyAll([
			{ type: 'plan', sequential: ['fetch-provider'], parallel: [], providerNames: {}, totalTimeoutMs: 20_000, cached: false },
			{ type: 'result_ready', result: { title: 'X', imageUrls: [] }, fromProvider: 'fetch-provider', cached: false },
			{ type: 'done', attempts: [] },
		])
		expect(after.phase).toBe('done')
	})

	it('done without any result_ready transitions to failed', () => {
		const after = applyAll([
			{ type: 'plan', sequential: ['fetch-provider'], parallel: [], providerNames: {}, totalTimeoutMs: 20_000, cached: false },
			{ type: 'attempt_failed', providerId: 'fetch-provider', errorCode: 'bot_block', ms: 12 },
			{ type: 'done', attempts: [] },
		])
		expect(after.phase).toBe('failed')
		expect(after.reason).toBe('all-providers-failed')
	})

	it('error event surfaces the orchestrator reason', () => {
		const after = applyAll([
			{ type: 'plan', sequential: ['fetch-provider'], parallel: [], providerNames: {}, totalTimeoutMs: 20_000, cached: false },
			{ type: 'error', reason: 'timeout' },
		])
		expect(after.phase).toBe('failed')
		expect(after.reason).toBe('timeout')
	})
})

describe('useScrapeUrl reducer: cache short-circuit', () => {
	it('plan + result_ready(cached=true) goes to partial in two events', () => {
		const after = applyAll([
			{ type: 'plan', sequential: ['fetch-provider'], parallel: [], providerNames: {}, totalTimeoutMs: 20_000, cached: true },
			{ type: 'result_ready', result: { title: 'cached', imageUrls: [] }, fromProvider: 'fetch-provider', cached: true },
			{ type: 'done', attempts: [] },
		])
		expect(after.phase).toBe('done')
		expect(after.cached).toBe(true)
		expect(after.result?.title).toBe('cached')
	})
})
