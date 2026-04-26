import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ScrapeContext } from '../../types'
import { ScrapeProviderError } from '../../types'
import { FETCH_PROVIDER_INFO, fetchProvider } from '../fetch'

// ---------------------------------------------------------------------------
// Test plumbing
// ---------------------------------------------------------------------------

function silentLogger(): ScrapeContext['logger'] {
	const noop = () => {}
	const fn = noop as unknown as ScrapeContext['logger']
	const handler: ProxyHandler<object> = {
		get: (_, prop) => {
			if (prop === 'child') return () => fn
			return noop
		},
	}
	return new Proxy({}, handler) as ScrapeContext['logger']
}

function makeCtx(url: string, opts: { signal?: AbortSignal; perAttemptTimeoutMs?: number } = {}): ScrapeContext {
	return {
		url,
		signal: opts.signal ?? new AbortController().signal,
		logger: silentLogger(),
		perAttemptTimeoutMs: opts.perAttemptTimeoutMs ?? 5000,
	}
}

type FakeResponse = {
	status: number
	body?: string
	contentType?: string
	finalUrl?: string
}

// Each entry queues a response keyed off the order of UA tries.
let queue: Array<FakeResponse | { throws: Error }> = []

function queueResponse(res: FakeResponse) {
	queue.push(res)
}
function queueError(err: Error) {
	queue.push({ throws: err })
}

beforeEach(() => {
	queue = []
	vi.stubGlobal('fetch', (input: RequestInfo) => {
		const next = queue.shift()
		if (!next) throw new Error('fetch called more times than queued responses')
		if ('throws' in next) throw next.throws
		const url = typeof input === 'string' ? input : input.url
		const headers = new Headers()
		headers.set('content-type', next.contentType ?? 'text/html; charset=utf-8')
		const body = next.body ?? ''
		const stream = new ReadableStream<Uint8Array>({
			start(ctrl) {
				ctrl.enqueue(new TextEncoder().encode(body))
				ctrl.close()
			},
		})
		// `Response.url` is read-only by spec; we let it default rather than
		// trying to override it. Tests that care about finalUrl can assert on
		// the input URL instead.
		void (next.finalUrl ?? url)
		return Promise.resolve(new Response(stream, { status: next.status, headers }))
	})
})

afterEach(() => {
	vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fetchProvider: success path', () => {
	it('returns RawPage on a 200 with non-blocked body using the first UA', async () => {
		queueResponse({ status: 200, body: '<html><head><title>OK</title></head><body>hello</body></html>' })
		const result = await fetchProvider.fetch(makeCtx('https://example.test/x'))
		expect(result.kind).toBe('html')
		if (result.kind !== 'html') return
		expect(result.providerId).toBe('fetch-provider')
		expect(result.status).toBe(200)
		expect(result.html).toContain('hello')
		expect(result.headers['x-fetch-ua']).toBe('facebook')
	})

	it('records the winning UA in headers when the first UA is blocked', async () => {
		// FB → 403, Googlebot → 200
		queueResponse({ status: 403 })
		queueResponse({ status: 200, body: '<html><body>fine</body></html>' })
		const result = await fetchProvider.fetch(makeCtx('https://example.test/x'))
		if (result.kind !== 'html') throw new Error('expected html')
		expect(result.headers['x-fetch-ua']).toBe('googlebot')
	})

	it('cycles past a 200 that contains a CF challenge to the next UA', async () => {
		queueResponse({ status: 200, body: '<html><head><title>Just a moment...</title></head><body>cf-browser-verification</body></html>' })
		queueResponse({ status: 200, body: '<html><body>actual content</body></html>' })
		const result = await fetchProvider.fetch(makeCtx('https://example.test/x'))
		if (result.kind !== 'html') throw new Error('expected html')
		expect(result.headers['x-fetch-ua']).toBe('googlebot')
		expect(result.html).toContain('actual content')
	})
})

describe('fetchProvider: failure modes', () => {
	it('throws bot_block when every UA receives 403/429/503', async () => {
		queueResponse({ status: 403 })
		queueResponse({ status: 429 })
		queueResponse({ status: 503 })
		await expect(fetchProvider.fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({
			name: 'ScrapeProviderError',
			code: 'bot_block',
		})
	})

	it('throws http_4xx for a 404 (terminal, no UA cycling)', async () => {
		queueResponse({ status: 404 })
		await expect(fetchProvider.fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({
			name: 'ScrapeProviderError',
			code: 'http_4xx',
		})
	})

	it('throws http_5xx for a 500', async () => {
		queueResponse({ status: 500 })
		await expect(fetchProvider.fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({
			name: 'ScrapeProviderError',
			code: 'http_5xx',
		})
	})

	it('continues to the next UA on a network error', async () => {
		queueError(new TypeError('fetch failed'))
		queueResponse({ status: 200, body: '<html><body>ok</body></html>' })
		const result = await fetchProvider.fetch(makeCtx('https://example.test/x'))
		if (result.kind !== 'html') throw new Error('expected html')
		expect(result.headers['x-fetch-ua']).toBe('googlebot')
	})

	it('throws timeout when the context signal is aborted before any UA succeeds', async () => {
		const ctrl = new AbortController()
		queueError(Object.assign(new Error('aborted'), { name: 'AbortError' }))
		ctrl.abort()
		await expect(fetchProvider.fetch(makeCtx('https://example.test/x', { signal: ctrl.signal }))).rejects.toMatchObject({
			name: 'ScrapeProviderError',
			code: 'timeout',
		})
	})
})

describe('fetchProvider: body cap', () => {
	it('truncates oversize bodies but still returns the truncated content', async () => {
		// 6 MB body: cap is 5 MB, so we should still get a string but it'll
		// be capped.
		const big = 'a'.repeat(6 * 1024 * 1024)
		queueResponse({ status: 200, body: big })
		const result = await fetchProvider.fetch(makeCtx('https://example.test/x'))
		if (result.kind !== 'html') throw new Error('expected html')
		expect(result.html.length).toBeLessThanOrEqual(FETCH_PROVIDER_INFO.maxBodyBytes)
		expect(result.html.length).toBeGreaterThan(0)
	})
})

describe('fetchProvider: metadata', () => {
	it('exposes the provider id and known UA list', () => {
		expect(fetchProvider.id).toBe('fetch-provider')
		expect(fetchProvider.kind).toBe('html')
		expect(fetchProvider.mode).toBe('sequential')
		expect(FETCH_PROVIDER_INFO.userAgents).toEqual(['facebook', 'googlebot', 'browser'])
	})

	it('is always available (no env required)', async () => {
		await expect(Promise.resolve(fetchProvider.isAvailable())).resolves.toBe(true)
	})

	it('exports the ScrapeProviderError class for callers that want to discriminate', () => {
		expect(new ScrapeProviderError('bot_block').code).toBe('bot_block')
	})
})
