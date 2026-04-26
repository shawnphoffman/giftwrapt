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
	mode?: 'sequential' | 'parallel'
	available?: boolean
	delayMs?: number
	// One of: a response, a thrown ScrapeProviderError, or a thrown plain Error.
	produces?: ProviderResponse | Error | ScrapeProviderError
	// If set, the provider builds its response from the request URL at call
	// time (lets tests assert what URL the orchestrator passed in).
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
	const mode = recipe.mode ?? 'sequential'
	const available = recipe.available ?? true
	return {
		id: recipe.id,
		kind: recipe.produces && !(recipe.produces instanceof Error) ? recipe.produces.kind : 'html',
		mode,
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

describe('orchestrate: chain order', () => {
	it('runs sequential providers in registration order', async () => {
		const order: Array<string> = []
		const a = makeProvider({ id: 'a', produces: htmlResponse('a') })
		const b = makeProvider({ id: 'b', produces: htmlResponse('b') })
		const tap = (p: ScrapeProvider): ScrapeProvider => ({
			...p,
			fetch: ctx => {
				order.push(p.id)
				return p.fetch(ctx)
			},
		})
		await orchestrate(
			{ url: 'https://example.test/x' },
			makeDeps({
				providers: [tap(a), tap(b)],
				// Score below threshold so `a` doesn't end the chain.
				scoreFn: () => 0,
			})
		)
		expect(order).toEqual(['a', 'b'])
	})

	it('honours providerOverride for ordering and selection', async () => {
		const order: Array<string> = []
		const a = makeProvider({ id: 'a', produces: htmlResponse('a') })
		const b = makeProvider({ id: 'b', produces: htmlResponse('b') })
		const c = makeProvider({ id: 'c', produces: htmlResponse('c') })
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
		expect(order).toEqual(['c', 'a'])
	})
})

describe('orchestrate: fallthrough', () => {
	it('stops chain once score clears threshold', async () => {
		const order: Array<string> = []
		const a = makeProvider({ id: 'a' })
		const b = makeProvider({ id: 'b' })
		const tap = (p: ScrapeProvider): ScrapeProvider => ({
			...p,
			fetch: ctx => {
				order.push(p.id)
				return p.fetch(ctx)
			},
		})
		const result = await orchestrate(
			{ url: 'https://example.test/x' },
			makeDeps({
				providers: [tap(a), tap(b)],
				scoreFn: () => 10,
				qualityThreshold: 3,
			})
		)
		expect(order).toEqual(['a'])
		if (result.kind === 'ok') expect(result.fromProvider).toBe('a')
	})

	it('continues chain when score is below threshold', async () => {
		const order: Array<string> = []
		const a = makeProvider({ id: 'a' })
		const b = makeProvider({ id: 'b' })
		const tap = (p: ScrapeProvider): ScrapeProvider => ({
			...p,
			fetch: ctx => {
				order.push(p.id)
				return p.fetch(ctx)
			},
		})
		await orchestrate(
			{ url: 'https://example.test/x' },
			makeDeps({
				providers: [tap(a), tap(b)],
				scoreFn: () => 1,
				qualityThreshold: 3,
			})
		)
		expect(order).toEqual(['a', 'b'])
	})
})

describe('orchestrate: parallel providers', () => {
	it('runs parallel alongside the sequential chain', async () => {
		const a = makeProvider({ id: 'seq', produces: htmlResponse('seq') })
		const par = makeProvider({ id: 'par', mode: 'parallel', produces: htmlResponse('par') })
		const result = await orchestrate(
			{ url: 'https://example.test/x' },
			makeDeps({
				providers: [a, par],
				scoreFn: r => (r.title === 'extracted' ? 5 : 0),
			})
		)
		expect(result.kind).toBe('ok')
		if (result.kind === 'ok') {
			const ids = result.attempts.map(att => att.providerId).sort()
			expect(ids).toEqual(['par', 'seq'])
		}
	})

	it('a higher-scoring late parallel result takes the win', async () => {
		const seq = makeProvider({ id: 'seq', produces: htmlResponse('seq') })
		const par = makeProvider({
			id: 'par',
			mode: 'parallel',
			delayMs: 20,
			produces: structured('par', { title: 'better', imageUrls: [] }),
		})
		const events: Array<StreamEvent> = []
		const result = await orchestrate(
			{ url: 'https://example.test/x' },
			makeDeps({
				providers: [seq, par],
				// seq scores 1, par scores 10 — par should overtake.
				scoreFn: r => (r.title === 'better' ? 10 : 1),
				qualityThreshold: 100, // never short-circuit on first win
				emit: e => events.push(e),
			})
		)
		expect(result.kind).toBe('ok')
		if (result.kind === 'ok') expect(result.fromProvider).toBe('par')
		expect(events.some(e => e.type === 'result_updated' && e.fromProvider === 'par')).toBe(true)
	})
})

describe('orchestrate: failures', () => {
	it('returns no-providers-available when nothing is available', async () => {
		const off = makeProvider({ id: 'off', available: false })
		const result = await orchestrate({ url: 'https://example.test/x' }, makeDeps({ providers: [off] }))
		expect(result.kind).toBe('error')
		if (result.kind === 'error') expect(result.reason).toBe('no-providers-available')
	})

	it('returns all-providers-failed when every provider errors', async () => {
		const a = makeProvider({ id: 'a', produces: new ScrapeProviderError('bot_block') })
		const b = makeProvider({ id: 'b', produces: new ScrapeProviderError('http_5xx') })
		const result = await orchestrate({ url: 'https://example.test/x' }, makeDeps({ providers: [a, b] }))
		expect(result.kind).toBe('error')
		if (result.kind === 'error') {
			expect(result.reason).toBe('all-providers-failed')
			expect(result.attempts.map(x => x.errorCode)).toEqual(['bot_block', 'http_5xx'])
		}
	})

	it('classifies generic errors as unknown', async () => {
		const a = makeProvider({ id: 'a', produces: new Error('boom') })
		const result = await orchestrate({ url: 'https://example.test/x' }, makeDeps({ providers: [a] }))
		expect(result.kind).toBe('error')
		if (result.kind === 'error') expect(result.attempts[0]?.errorCode).toBe('unknown')
	})
})

describe('orchestrate: persistence', () => {
	it('calls persistAttempt for each attempt (success + failure)', async () => {
		const ok = makeProvider({ id: 'ok', produces: htmlResponse('ok') })
		const bad = makeProvider({ id: 'bad', produces: new ScrapeProviderError('timeout') })
		const persisted: Array<{ providerId: string; itemId?: number; url: string; ok: boolean }> = []
		const persistAttempt: NonNullable<OrchestratorDeps['persistAttempt']> = rec => {
			persisted.push({ providerId: rec.providerId, itemId: rec.itemId, url: rec.url, ok: rec.ok })
			return Promise.resolve()
		}
		await orchestrate(
			{ url: 'https://example.test/x', itemId: 42 },
			makeDeps({
				providers: [bad, ok],
				scoreFn: () => 0, // force chain to run both
				persistAttempt,
			})
		)
		expect(persisted).toHaveLength(2)
		expect(persisted.map(r => r.providerId).sort()).toEqual(['bad', 'ok'])
		expect(persisted.every(r => r.itemId === 42 && r.url === 'https://example.test/x')).toBe(true)
	})
})

describe('orchestrate: events', () => {
	it('emits plan first, attempt events per provider, and done last', async () => {
		const events: Array<StreamEvent> = []
		const a = makeProvider({ id: 'a', produces: htmlResponse('a') })
		await orchestrate({ url: 'https://example.test/x' }, makeDeps({ providers: [a], emit: e => events.push(e) }))
		const types = events.map(e => e.type)
		expect(types[0]).toBe('plan')
		expect(types).toContain('attempt_started')
		expect(types).toContain('attempt_completed')
		expect(types).toContain('result_ready')
		expect(types[types.length - 1]).toBe('done')
	})

	it('emits attempt_failed for failing providers', async () => {
		const events: Array<StreamEvent> = []
		const a = makeProvider({ id: 'a', produces: new ScrapeProviderError('http_5xx') })
		const b = makeProvider({ id: 'b', produces: htmlResponse('b') })
		await orchestrate({ url: 'https://example.test/x' }, makeDeps({ providers: [a, b], emit: e => events.push(e), scoreFn: () => 0 }))
		expect(events.some(e => e.type === 'attempt_failed' && e.providerId === 'a' && e.errorCode === 'http_5xx')).toBe(true)
	})
})

describe('orchestrate: timeout', () => {
	it('returns timeout when the overall budget expires before any provider succeeds', async () => {
		const slow = makeProvider({ id: 'slow', delayMs: 200 })
		const result = await orchestrate(
			{ url: 'https://example.test/x' },
			makeDeps({ providers: [slow], overallTimeoutMs: 30, perProviderTimeoutMs: 1000 })
		)
		expect(result.kind).toBe('error')
		if (result.kind === 'error') expect(result.reason).toBe('timeout')
	})
})
