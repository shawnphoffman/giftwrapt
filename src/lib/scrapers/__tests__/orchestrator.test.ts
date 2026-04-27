import { describe, expect, it, vi } from 'vitest'

// Stub env for the indirectly-imported pino logger so tests don't need real
// DATABASE_URL / BETTER_AUTH_SECRET.
vi.mock('@/env', () => ({
	env: {
		LOG_LEVEL: 'silent',
		LOG_PRETTY: false,
		BETTER_AUTH_SECRET: 'test-secret',
	},
}))

import { orchestrate } from '../orchestrator'
import type { OrchestratorDeps, ProviderResponse, ScrapeProvider, ScrapeResult, StreamEvent } from '../types'
import { ScrapeProviderError } from '../types'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

type ProviderRecipe = {
	id: string
	tier?: number
	available?: boolean
	delayMs?: number
	produces?: ProviderResponse | Error | ScrapeProviderError
	dynamicResponse?: (url: string) => ProviderResponse
}

const htmlResponse = (id: string, html = '<html></html>'): ProviderResponse => ({
	kind: 'html',
	providerId: id,
	html,
	finalUrl: 'https://example.test/final',
	status: 200,
	headers: {},
	fetchMs: 1,
})

const structured = (id: string, result: ScrapeResult): ProviderResponse => ({
	kind: 'structured',
	providerId: id,
	result,
	fetchMs: 1,
})

function makeProvider(recipe: ProviderRecipe): ScrapeProvider {
	const tier = recipe.tier ?? 1
	const available = recipe.available ?? true
	return {
		id: recipe.id,
		kind: recipe.produces && !(recipe.produces instanceof Error) ? recipe.produces.kind : 'html',
		tier,
		isAvailable: () => available,
		fetch: async ctx => {
			if (recipe.delayMs) {
				await new Promise<void>((resolve, reject) => {
					const t = setTimeout(resolve, recipe.delayMs)
					ctx.signal.addEventListener('abort', () => {
						clearTimeout(t)
						reject(new Error('aborted'))
					})
				})
			}
			if (recipe.produces instanceof Error) throw recipe.produces
			if (recipe.dynamicResponse) return recipe.dynamicResponse(ctx.url)
			if (recipe.produces) return recipe.produces
			return htmlResponse(recipe.id)
		},
	}
}

// Parallel racer helper (no `tier` field).
function makeRacer(recipe: Omit<ProviderRecipe, 'tier'>): ScrapeProvider {
	const provider = makeProvider({ ...recipe, tier: 1 })
	return { ...provider, tier: undefined }
}

function recordEmitter() {
	const events: Array<StreamEvent> = []
	return { events, emit: (e: StreamEvent) => events.push(e) }
}

function makeDeps(overrides: Partial<OrchestratorDeps> & { providers: Array<ScrapeProvider> }): OrchestratorDeps {
	return {
		extractFromRaw: () => ({ title: 'extracted', imageUrls: [] }),
		scoreFn: r => (r.title ? 5 : 0),
		...overrides,
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('orchestrate: input validation', () => {
	it('rejects non-http URLs', async () => {
		const { events, emit } = recordEmitter()
		const result = await orchestrate({ url: 'javascript:alert(1)' }, makeDeps({ providers: [], emit }))
		expect(result.kind).toBe('error')
		if (result.kind === 'error') expect(result.reason).toBe('invalid-url')
		expect(events.some(e => e.type === 'error' && e.reason === 'invalid-url')).toBe(true)
	})

	it('rejects unparseable URLs', async () => {
		const result = await orchestrate({ url: 'not a url' }, makeDeps({ providers: [] }))
		expect(result.kind).toBe('error')
	})
})

describe('orchestrate: cache', () => {
	it('returns the cached result without invoking providers', async () => {
		const fetchSpy = vi.fn()
		const provider = makeProvider({ id: 'p1' })
		const provWithSpy: ScrapeProvider = { ...provider, fetch: ctx => (fetchSpy(), provider.fetch(ctx)) }
		const cached: ScrapeResult = { title: 'cached', imageUrls: ['https://img'] }
		const { events, emit } = recordEmitter()
		const result = await orchestrate(
			{ url: 'https://example.test/x' },
			makeDeps({
				providers: [provWithSpy],
				loadCache: () => Promise.resolve({ result: cached, fromProvider: 'p1' }),
				emit,
			})
		)
		expect(result.kind).toBe('ok')
		if (result.kind === 'ok') {
			expect(result.cached).toBe(true)
			expect(result.result).toEqual(cached)
			expect(result.attempts).toEqual([])
		}
		expect(fetchSpy).not.toHaveBeenCalled()
		const planEvent = events.find(e => e.type === 'plan')
		expect(planEvent).toBeDefined()
		if (planEvent?.type === 'plan') expect(planEvent.cached).toBe(true)
		expect(events.some(e => e.type === 'result_ready' && e.cached === true)).toBe(true)
	})

	it('force=true bypasses cache', async () => {
		const fetchSpy = vi.fn()
		const provider = makeProvider({ id: 'p1' })
		const provWithSpy: ScrapeProvider = { ...provider, fetch: ctx => (fetchSpy(), provider.fetch(ctx)) }
		const result = await orchestrate(
			{ url: 'https://example.test/x', force: true },
			makeDeps({
				providers: [provWithSpy],
				loadCache: () => Promise.resolve({ result: { title: 'cached', imageUrls: [] }, fromProvider: 'p1' }),
			})
		)
		expect(result.kind).toBe('ok')
		expect(fetchSpy).toHaveBeenCalledOnce()
	})
})

describe('orchestrate: tier execution', () => {
	it('fires all entries within a tier in parallel', async () => {
		const callTimes: Array<{ id: string; t: number }> = []
		const a = makeProvider({ id: 'a', tier: 1, delayMs: 50 })
		const b = makeProvider({ id: 'b', tier: 1, delayMs: 50 })
		const tap = (p: ScrapeProvider): ScrapeProvider => ({
			...p,
			fetch: ctx => {
				callTimes.push({ id: p.id, t: Date.now() })
				return p.fetch(ctx)
			},
		})
		await orchestrate({ url: 'https://example.test/x' }, makeDeps({ providers: [tap(a), tap(b)], scoreFn: () => 0 }))
		// Both fired in parallel: their start timestamps should be very
		// close together. Asserting sub-50ms gap is the meaningful
		// parallelism check; total wall-clock varies by host load so we
		// don't assert it directly.
		expect(callTimes).toHaveLength(2)
		const fireDelta = Math.abs(callTimes[1].t - callTimes[0].t)
		expect(fireDelta).toBeLessThan(50)
	})

	it('does NOT fire tier 2 when tier 1 merged result clears threshold', async () => {
		const tier2Spy = vi.fn()
		const t1 = makeProvider({ id: 't1', tier: 1 })
		const t2 = makeProvider({ id: 't2', tier: 2 })
		const t2Tapped: ScrapeProvider = { ...t2, fetch: ctx => (tier2Spy(), t2.fetch(ctx)) }
		await orchestrate({ url: 'https://example.test/x' }, makeDeps({ providers: [t1, t2Tapped], scoreFn: () => 10, qualityThreshold: 5 }))
		expect(tier2Spy).not.toHaveBeenCalled()
	})

	it('fires tier 2 when tier 1 merged result is below threshold', async () => {
		const tier2Spy = vi.fn()
		const t1 = makeProvider({ id: 't1', tier: 1 })
		const t2 = makeProvider({ id: 't2', tier: 2 })
		const t2Tapped: ScrapeProvider = { ...t2, fetch: ctx => (tier2Spy(), t2.fetch(ctx)) }
		await orchestrate({ url: 'https://example.test/x' }, makeDeps({ providers: [t1, t2Tapped], scoreFn: () => 1, qualityThreshold: 5 }))
		expect(tier2Spy).toHaveBeenCalledOnce()
	})

	it('honours providerOverride for ordering and selection', async () => {
		const order: Array<string> = []
		const a = makeProvider({ id: 'a' })
		const b = makeProvider({ id: 'b' })
		const c = makeProvider({ id: 'c' })
		const tap = (p: ScrapeProvider): ScrapeProvider => ({
			...p,
			fetch: ctx => {
				order.push(p.id)
				return p.fetch(ctx)
			},
		})
		await orchestrate(
			{ url: 'https://example.test/x', providerOverride: ['c', 'a'] },
			makeDeps({ providers: [tap(a), tap(b), tap(c)], scoreFn: () => 0 })
		)
		expect(order.sort()).toEqual(['a', 'c'])
	})

	it('returns the highest-scoring tier result when no tier clears threshold', async () => {
		const t1 = makeProvider({
			id: 't1',
			tier: 1,
			produces: structured('t1', { title: 'lowscore', imageUrls: [] }),
		})
		const t2 = makeProvider({
			id: 't2',
			tier: 2,
			produces: structured('t2', { title: 'midscore', imageUrls: [] }),
		})
		const result = await orchestrate(
			{ url: 'https://example.test/x' },
			makeDeps({
				providers: [t1, t2],
				scoreFn: r => (r.title === 'midscore' ? 4 : 1),
				qualityThreshold: 100, // never clears
			})
		)
		expect(result.kind).toBe('ok')
		if (result.kind === 'ok') expect(result.fromProvider).toBe('t2')
	})
})

describe('orchestrate: tier failure handling', () => {
	it('advances to next tier when all tier-1 providers fail', async () => {
		const t1a = makeProvider({ id: 't1a', tier: 1, produces: new ScrapeProviderError('bot_block') })
		const t1b = makeProvider({ id: 't1b', tier: 1, produces: new ScrapeProviderError('http_5xx') })
		const t2 = makeProvider({ id: 't2', tier: 2, produces: htmlResponse('t2') })
		const result = await orchestrate(
			{ url: 'https://example.test/x' },
			makeDeps({ providers: [t1a, t1b, t2], scoreFn: () => 5, qualityThreshold: 3 })
		)
		expect(result.kind).toBe('ok')
		if (result.kind === 'ok') expect(result.fromProvider).toBe('t2')
	})

	it('merges only the surviving provider when one in the tier fails', async () => {
		const t1a = makeProvider({ id: 't1a', tier: 1, produces: new ScrapeProviderError('timeout') })
		const t1b = makeProvider({ id: 't1b', tier: 1, produces: htmlResponse('t1b') })
		const result = await orchestrate(
			{ url: 'https://example.test/x' },
			makeDeps({ providers: [t1a, t1b], scoreFn: () => 5, qualityThreshold: 3 })
		)
		expect(result.kind).toBe('ok')
		if (result.kind === 'ok') {
			// One contributor → bare provider id, no `merged:` sentinel.
			expect(result.fromProvider).toBe('t1b')
		}
	})

	it('returns all-providers-failed when every tier fails completely', async () => {
		const t1 = makeProvider({ id: 't1', tier: 1, produces: new ScrapeProviderError('bot_block') })
		const t2 = makeProvider({ id: 't2', tier: 2, produces: new ScrapeProviderError('http_5xx') })
		const result = await orchestrate({ url: 'https://example.test/x' }, makeDeps({ providers: [t1, t2] }))
		expect(result.kind).toBe('error')
		if (result.kind === 'error') {
			expect(result.reason).toBe('all-providers-failed')
			expect(result.attempts.map(x => x.errorCode).sort()).toEqual(['bot_block', 'http_5xx'])
		}
	})

	it('classifies generic errors as unknown', async () => {
		const a = makeProvider({ id: 'a', produces: new Error('boom') })
		const result = await orchestrate({ url: 'https://example.test/x' }, makeDeps({ providers: [a] }))
		expect(result.kind).toBe('error')
		if (result.kind === 'error') expect(result.attempts[0]?.errorCode).toBe('unknown')
	})

	it('returns no-providers-available when nothing is available', async () => {
		const off = makeProvider({ id: 'off', available: false })
		const result = await orchestrate({ url: 'https://example.test/x' }, makeDeps({ providers: [off] }))
		expect(result.kind).toBe('error')
		if (result.kind === 'error') expect(result.reason).toBe('no-providers-available')
	})
})

describe('orchestrate: merging within a tier', () => {
	it('merges complementary fields from two tier-1 providers and re-scores higher than either alone', async () => {
		// Both contributors must carry a title (the orchestrator's
		// minimum-signal gate rejects title-less results upstream of the
		// merge). A and B each score the same on their own; merging
		// combines their distinct fields (image from A, price from B)
		// into a strictly-higher-scoring result.
		const a = makeProvider({
			id: 'a',
			tier: 1,
			produces: structured('a', { title: 'Widget', imageUrls: ['https://img/x.jpg'] }),
		})
		const b = makeProvider({
			id: 'b',
			tier: 1,
			produces: structured('b', { title: 'Widget alt', price: '$10', imageUrls: [] }),
		})
		const result = await orchestrate(
			{ url: 'https://example.test/x' },
			makeDeps({
				providers: [a, b],
				// 1 point per non-empty top-level scalar, +1 for any imageUrls.
				scoreFn: r => {
					let s = 0
					if (r.title) s += 1
					if (r.price) s += 1
					if (r.imageUrls.length > 0) s += 1
					return s
				},
				qualityThreshold: 100,
			})
		)
		expect(result.kind).toBe('ok')
		if (result.kind === 'ok') {
			// A and B tied at score 2; stable sort keeps A as base, so its
			// title wins. B contributes the price A lacked.
			expect(result.result.title).toBe('Widget')
			expect(result.result.price).toBe('$10')
			expect(result.result.imageUrls).toEqual(['https://img/x.jpg'])
			expect(result.fromProvider).toContain('merged:')
			expect(result.fromProvider).toContain('a')
			expect(result.fromProvider).toContain('b')
		}
	})

	it('merged result clearing threshold short-circuits later tiers', async () => {
		const tier2Spy = vi.fn()
		// Both contributors carry a title (minimum-signal gate); B also
		// carries a price that A lacks. The merged result has both,
		// scoring the threshold and stopping the chain.
		const a = makeProvider({ id: 'a', tier: 1, produces: structured('a', { title: 'Widget', imageUrls: [] }) })
		const b = makeProvider({ id: 'b', tier: 1, produces: structured('b', { title: 'Widget alt', price: '$10', imageUrls: [] }) })
		const t2 = makeProvider({ id: 't2', tier: 2 })
		const t2Tapped: ScrapeProvider = { ...t2, fetch: ctx => (tier2Spy(), t2.fetch(ctx)) }
		await orchestrate(
			{ url: 'https://example.test/x' },
			makeDeps({
				providers: [a, b, t2Tapped],
				scoreFn: r => (r.title ? 1 : 0) + (r.price ? 1 : 0),
				qualityThreshold: 2, // tier 1 alone scores 1 each; merged scores 2 → clears
			})
		)
		expect(tier2Spy).not.toHaveBeenCalled()
	})

	it('uses the injected mergeFn when provided in deps', async () => {
		const customMerge = vi.fn().mockImplementation(() => ({
			result: { title: 'CUSTOM', imageUrls: [] },
			fromProvider: 'custom-mock',
		}))
		const a = makeProvider({ id: 'a', tier: 1, produces: structured('a', { title: 'A', imageUrls: [] }) })
		const b = makeProvider({ id: 'b', tier: 1, produces: structured('b', { title: 'B', imageUrls: [] }) })
		const result = await orchestrate(
			{ url: 'https://example.test/x' },
			makeDeps({ providers: [a, b], scoreFn: () => 10, qualityThreshold: 1, mergeFn: customMerge })
		)
		expect(customMerge).toHaveBeenCalledTimes(1)
		expect(result.kind).toBe('ok')
		if (result.kind === 'ok') {
			expect(result.result.title).toBe('CUSTOM')
			expect(result.fromProvider).toBe('custom-mock')
		}
	})
})

describe('orchestrate: fetch-provider as tier 0', () => {
	it('fires fetch-provider (tier 0) before any tier-1 provider', async () => {
		const order: Array<string> = []
		const fp = makeProvider({ id: 'fetch-provider', tier: 0 })
		const t1 = makeProvider({ id: 't1', tier: 1 })
		const tap = (p: ScrapeProvider): ScrapeProvider => ({
			...p,
			fetch: ctx => {
				order.push(p.id)
				return p.fetch(ctx)
			},
		})
		await orchestrate({ url: 'https://example.test/x' }, makeDeps({ providers: [tap(t1), tap(fp)], scoreFn: () => 0 }))
		// fetch-provider runs first regardless of array order.
		expect(order[0]).toBe('fetch-provider')
	})

	it('clearing threshold at tier 0 short-circuits later tiers', async () => {
		const tier1Spy = vi.fn()
		const fp = makeProvider({ id: 'fetch-provider', tier: 0 })
		const t1 = makeProvider({ id: 't1', tier: 1 })
		const t1Tapped: ScrapeProvider = { ...t1, fetch: ctx => (tier1Spy(), t1.fetch(ctx)) }
		await orchestrate({ url: 'https://example.test/x' }, makeDeps({ providers: [fp, t1Tapped], scoreFn: () => 10, qualityThreshold: 5 }))
		expect(tier1Spy).not.toHaveBeenCalled()
	})
})

describe('orchestrate: parallel racers (commit A: ai-provider)', () => {
	it('a parallel racer with no tier fires alongside the tier loop', async () => {
		const t1 = makeProvider({ id: 't1', tier: 1, produces: htmlResponse('t1') })
		const racer = makeRacer({ id: 'racer', produces: structured('racer', { title: 'racer-result', imageUrls: [] }) })
		const result = await orchestrate(
			{ url: 'https://example.test/x' },
			makeDeps({ providers: [t1, racer], scoreFn: () => 5, qualityThreshold: 3 })
		)
		expect(result.kind).toBe('ok')
		if (result.kind === 'ok') {
			const ids = result.attempts.map(att => att.providerId).sort()
			expect(ids).toEqual(['racer', 't1'])
		}
	})

	it('a higher-scoring late racer takes the win', async () => {
		const t1 = makeProvider({ id: 't1', tier: 1, produces: htmlResponse('t1') })
		const racer = makeRacer({
			id: 'racer',
			delayMs: 30,
			produces: structured('racer', { title: 'better', imageUrls: [] }),
		})
		const events: Array<StreamEvent> = []
		const result = await orchestrate(
			{ url: 'https://example.test/x' },
			makeDeps({
				providers: [t1, racer],
				scoreFn: r => (r.title === 'better' ? 10 : 1),
				qualityThreshold: 100, // never short-circuit
				emit: e => events.push(e),
			})
		)
		expect(result.kind).toBe('ok')
		if (result.kind === 'ok') expect(result.fromProvider).toBe('racer')
		expect(events.some(e => e.type === 'result_updated' && e.fromProvider === 'racer')).toBe(true)
	})
})

describe('orchestrate: streaming events', () => {
	it('emits plan with tiers + parallelRacers, then per-tier events, then done', async () => {
		const events: Array<StreamEvent> = []
		const t1 = makeProvider({ id: 't1', tier: 1 })
		const t2 = makeProvider({ id: 't2', tier: 2 })
		const racer = makeRacer({ id: 'racer' })
		await orchestrate(
			{ url: 'https://example.test/x' },
			makeDeps({ providers: [t1, t2, racer], scoreFn: () => 1, qualityThreshold: 3, emit: e => events.push(e) })
		)
		const plan = events.find(e => e.type === 'plan')
		expect(plan).toBeDefined()
		if (plan?.type === 'plan') {
			expect(plan.tiers.map(t => t.tier)).toEqual([1, 2])
			expect(plan.parallelRacers).toEqual(['racer'])
		}
		const tierStarts = events.filter(e => e.type === 'tier_started').map(e => (e as { tier: number }).tier)
		expect(tierStarts).toEqual([1, 2])
		const tierCompletes = events.filter(e => e.type === 'tier_completed').map(e => (e as { tier: number }).tier)
		expect(tierCompletes).toEqual([1, 2])
		expect(events[events.length - 1].type).toBe('done')
	})

	it('emits tier_skipped for tiers we never reach', async () => {
		const events: Array<StreamEvent> = []
		const t1 = makeProvider({ id: 't1', tier: 1 })
		const t2 = makeProvider({ id: 't2', tier: 2 })
		const t3 = makeProvider({ id: 't3', tier: 3 })
		await orchestrate(
			{ url: 'https://example.test/x' },
			makeDeps({ providers: [t1, t2, t3], scoreFn: () => 10, qualityThreshold: 3, emit: e => events.push(e) })
		)
		const skipped = events.filter(e => e.type === 'tier_skipped').map(e => (e as { tier: number }).tier)
		expect(skipped.sort()).toEqual([2, 3])
	})

	it('tier_completed reports cleared=true when threshold met, false when below', async () => {
		const events: Array<StreamEvent> = []
		const t1 = makeProvider({ id: 't1', tier: 1 })
		const t2 = makeProvider({ id: 't2', tier: 2 })
		await orchestrate(
			{ url: 'https://example.test/x' },
			makeDeps({
				providers: [t1, t2],
				scoreFn: r => (r.title ? 5 : 0),
				qualityThreshold: 5,
				emit: e => events.push(e),
			})
		)
		const t1Done = events.find(e => e.type === 'tier_completed' && e.tier === 1)
		expect(t1Done).toBeDefined()
		if (t1Done?.type === 'tier_completed') {
			expect(t1Done.cleared).toBe(true)
			expect(t1Done.contributors).toEqual(['t1'])
		}
	})

	it('tier_completed reports mergedScore=null when every provider in the tier failed', async () => {
		const events: Array<StreamEvent> = []
		const t1 = makeProvider({ id: 't1', tier: 1, produces: new ScrapeProviderError('bot_block') })
		const t2 = makeProvider({ id: 't2', tier: 2 })
		await orchestrate(
			{ url: 'https://example.test/x' },
			makeDeps({ providers: [t1, t2], scoreFn: () => 0, qualityThreshold: 5, emit: e => events.push(e) })
		)
		const t1Done = events.find(e => e.type === 'tier_completed' && e.tier === 1)
		expect(t1Done).toBeDefined()
		if (t1Done?.type === 'tier_completed') {
			expect(t1Done.mergedScore).toBe(null)
			expect(t1Done.contributors).toEqual([])
			expect(t1Done.cleared).toBe(false)
		}
	})

	it('emits attempt_failed for failing providers', async () => {
		const events: Array<StreamEvent> = []
		const a = makeProvider({ id: 'a', tier: 1, produces: new ScrapeProviderError('http_5xx') })
		const b = makeProvider({ id: 'b', tier: 2, produces: htmlResponse('b') })
		await orchestrate({ url: 'https://example.test/x' }, makeDeps({ providers: [a, b], emit: e => events.push(e), scoreFn: () => 0 }))
		expect(events.some(e => e.type === 'attempt_failed' && e.providerId === 'a' && e.errorCode === 'http_5xx')).toBe(true)
	})
})

describe('orchestrate: persistence', () => {
	it('calls persistAttempt for each provider attempt (success + failure)', async () => {
		const ok = makeProvider({ id: 'ok', tier: 1, produces: htmlResponse('ok') })
		const bad = makeProvider({ id: 'bad', tier: 1, produces: new ScrapeProviderError('timeout') })
		const persisted: Array<{ providerId: string; itemId?: number; url: string; ok: boolean }> = []
		const persistAttempt: NonNullable<OrchestratorDeps['persistAttempt']> = rec => {
			persisted.push({ providerId: rec.providerId, itemId: rec.itemId, url: rec.url, ok: rec.ok })
			return Promise.resolve()
		}
		await orchestrate(
			{ url: 'https://example.test/x', itemId: 42 },
			makeDeps({
				providers: [bad, ok],
				scoreFn: () => 0,
				persistAttempt,
			})
		)
		expect(persisted).toHaveLength(2)
		expect(persisted.map(r => r.providerId).sort()).toEqual(['bad', 'ok'])
		expect(persisted.every(r => r.itemId === 42 && r.url === 'https://example.test/x')).toBe(true)
	})
})

describe('orchestrate: minimum-signal gate (title required)', () => {
	it('marks the attempt as failed when the extracted result has no title', async () => {
		const a = makeProvider({ id: 'a', tier: 1, produces: structured('a', { imageUrls: ['https://img/x.jpg'] }) })
		const persisted: Array<{ providerId: string; ok: boolean; errorCode?: string }> = []
		const result = await orchestrate(
			{ url: 'https://example.test/x' },
			makeDeps({
				providers: [a],
				scoreFn: () => 5,
				persistAttempt: rec => {
					persisted.push({ providerId: rec.providerId, ok: rec.ok, errorCode: rec.errorCode })
					return Promise.resolve()
				},
			})
		)
		expect(result.kind).toBe('error')
		expect(persisted).toEqual([{ providerId: 'a', ok: false, errorCode: 'invalid_response' }])
	})

	it('marks the attempt as failed when title is whitespace-only', async () => {
		const a = makeProvider({ id: 'a', tier: 1, produces: structured('a', { title: '   \n  ', imageUrls: [] }) })
		const events: Array<StreamEvent> = []
		const result = await orchestrate(
			{ url: 'https://example.test/x' },
			makeDeps({ providers: [a], scoreFn: () => 5, emit: e => events.push(e) })
		)
		expect(result.kind).toBe('error')
		const failed = events.find(e => e.type === 'attempt_failed' && e.providerId === 'a')
		expect(failed).toBeDefined()
		if (failed?.type === 'attempt_failed') expect(failed.errorCode).toBe('invalid_response')
	})

	it('still succeeds when title is present even if other fields are empty', async () => {
		const a = makeProvider({ id: 'a', tier: 1, produces: structured('a', { title: 'Widget', imageUrls: [] }) })
		const result = await orchestrate({ url: 'https://example.test/x' }, makeDeps({ providers: [a], scoreFn: () => 5, qualityThreshold: 3 }))
		expect(result.kind).toBe('ok')
		if (result.kind === 'ok') expect(result.result.title).toBe('Widget')
	})

	it('falls through to the next tier when tier-1 produces only title-less results', async () => {
		const t1 = makeProvider({ id: 't1', tier: 1, produces: structured('t1', { imageUrls: [] }) })
		const t2 = makeProvider({ id: 't2', tier: 2, produces: structured('t2', { title: 'Found it', imageUrls: [] }) })
		const result = await orchestrate(
			{ url: 'https://example.test/x' },
			makeDeps({ providers: [t1, t2], scoreFn: () => 5, qualityThreshold: 3 })
		)
		expect(result.kind).toBe('ok')
		if (result.kind === 'ok') {
			expect(result.fromProvider).toBe('t2')
			expect(result.result.title).toBe('Found it')
		}
	})
})

describe('orchestrate: timeout', () => {
	it('returns timeout when the overall budget expires before any provider succeeds', async () => {
		const slow = makeProvider({ id: 'slow', tier: 1, delayMs: 200 })
		const result = await orchestrate(
			{ url: 'https://example.test/x' },
			makeDeps({ providers: [slow], overallTimeoutMs: 30, perProviderTimeoutMs: 1000 })
		)
		expect(result.kind).toBe('error')
		if (result.kind === 'error') expect(result.reason).toBe('timeout')
	})
})
