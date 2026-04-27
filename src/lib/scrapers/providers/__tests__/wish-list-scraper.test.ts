import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({
	env: {
		LOG_LEVEL: 'silent',
		LOG_PRETTY: false,
		BETTER_AUTH_SECRET: 'test-secret',
	},
}))

import type { WishListScraperEntry } from '@/lib/settings'

import type { ScrapeContext, ScrapeProvider } from '../../types'
import { createWishListScraperProvider } from '../wish-list-scraper'

const TEST_ENTRY: WishListScraperEntry = {
	type: 'wish-list-scraper',
	id: 'test',
	name: 'Wish List Scraper Test',
	enabled: true,
	tier: 1,
	endpoint: 'https://browser-services.test',
	token: 'wls-token-123',
}

function makeProvider(overrides: Partial<WishListScraperEntry> = {}): ScrapeProvider {
	return createWishListScraperProvider({ ...TEST_ENTRY, ...overrides })
}

function silentLogger(): ScrapeContext['logger'] {
	const noop = () => {}
	const fn = noop as unknown as ScrapeContext['logger']
	return new Proxy({} as object, { get: (_, p) => (p === 'child' ? () => fn : noop) }) as ScrapeContext['logger']
}

function makeCtx(url: string): ScrapeContext {
	return { url, signal: new AbortController().signal, logger: silentLogger(), perAttemptTimeoutMs: 5000 }
}

type FacadePayload = {
	url?: string
	finalUrl?: string
	status?: number
	html?: string
	headers?: Record<string, string>
	fetchMs?: number
	solvedBy?: string
	error?: { code?: string; message?: string; retryable?: boolean }
}

let queue: Array<{ httpStatus: number; payload?: FacadePayload; rawText?: string }> = []
let lastFetchInit: { method?: string; body?: string; headers: Record<string, string>; url: string } | null = null

beforeEach(() => {
	queue = []
	lastFetchInit = null
	vi.stubGlobal('fetch', (input: RequestInfo, init?: RequestInit) => {
		const next = queue.shift()
		if (!next) throw new Error('fetch called more times than queued responses')
		const url = typeof input === 'string' ? input : input.url
		lastFetchInit = {
			method: init?.method,
			body: init?.body as string | undefined,
			headers: (init?.headers as Record<string, string> | undefined) ?? {},
			url,
		}
		const body = next.rawText ?? JSON.stringify(next.payload ?? {})
		return Promise.resolve(new Response(body, { status: next.httpStatus, headers: { 'content-type': 'application/json' } }))
	})
})

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('wishListScraperProvider: availability', () => {
	it('is available when enabled with a parseable endpoint and a non-empty token', () => {
		expect(makeProvider().isAvailable()).toBe(true)
	})

	it('is NOT available when disabled', () => {
		expect(makeProvider({ enabled: false }).isAvailable()).toBe(false)
	})

	it('is NOT available when endpoint is empty', () => {
		expect(makeProvider({ endpoint: '' }).isAvailable()).toBe(false)
	})

	it('is NOT available when token is empty', () => {
		expect(makeProvider({ token: '' }).isAvailable()).toBe(false)
	})
})

describe('wishListScraperProvider: success path', () => {
	it('POSTs {endpoint}/fetch with the URL body and X-Browser-Token, returning RawPage', async () => {
		queue.push({
			httpStatus: 200,
			payload: {
				url: 'https://example.test/x',
				finalUrl: 'https://example.test/x?utm=1',
				status: 200,
				html: '<html><body>rendered</body></html>',
				solvedBy: 'browserless',
			},
		})
		const result = await makeProvider().fetch(makeCtx('https://example.test/x'))
		expect(result.kind).toBe('html')
		if (result.kind !== 'html') return
		expect(result.providerId).toBe('wish-list-scraper:test')
		expect(result.html).toContain('rendered')
		expect(result.finalUrl).toBe('https://example.test/x?utm=1')
		expect(result.status).toBe(200)
		expect(result.headers['x-solved-by']).toBe('browserless')
		expect(lastFetchInit?.method).toBe('POST')
		expect(lastFetchInit?.url).toBe('https://browser-services.test/fetch')
		expect(lastFetchInit?.headers['X-Browser-Token']).toBe('wls-token-123')
		const body = JSON.parse(lastFetchInit?.body ?? '{}') as { url: string }
		expect(body.url).toBe('https://example.test/x')
	})

	it('falls back to ctx.url when finalUrl is missing in the payload', async () => {
		queue.push({
			httpStatus: 200,
			payload: { html: '<html>ok</html>', status: 200 },
		})
		const result = await makeProvider().fetch(makeCtx('https://example.test/x'))
		if (result.kind !== 'html') return
		expect(result.finalUrl).toBe('https://example.test/x')
	})
})

describe('wishListScraperProvider: facade error envelope mapping', () => {
	it('maps error.code = bot_block to bot_block', async () => {
		queue.push({ httpStatus: 502, payload: { error: { code: 'bot_block', message: 'all upstreams blocked' } } })
		await expect(makeProvider().fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'bot_block' })
	})

	it('maps error.code = timeout to timeout', async () => {
		queue.push({ httpStatus: 504, payload: { error: { code: 'timeout', message: 'too slow' } } })
		await expect(makeProvider().fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'timeout' })
	})

	it('maps error.code = upstream_5xx to http_5xx', async () => {
		queue.push({ httpStatus: 502, payload: { error: { code: 'upstream_5xx', message: 'browserless 503' } } })
		await expect(makeProvider().fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'http_5xx' })
	})

	it('maps error.code = auth to config_missing', async () => {
		queue.push({ httpStatus: 401, payload: { error: { code: 'auth', message: 'bad token' } } })
		await expect(makeProvider().fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'config_missing' })
	})

	it('maps error.code = config_missing to config_missing', async () => {
		queue.push({ httpStatus: 500, payload: { error: { code: 'config_missing', message: 'BROWSER_TOKEN unset' } } })
		await expect(makeProvider().fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'config_missing' })
	})

	it('maps error.code = invalid_url and body_too_large to invalid_response', async () => {
		queue.push({ httpStatus: 400, payload: { error: { code: 'invalid_url', message: 'bad url' } } })
		await expect(makeProvider().fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'invalid_response' })

		queue.push({ httpStatus: 413, payload: { error: { code: 'body_too_large', message: 'response > 5MB' } } })
		await expect(makeProvider().fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'invalid_response' })
	})
})

describe('wishListScraperProvider: HTTP fallback when error envelope is missing', () => {
	it('classifies bare 401 as config_missing', async () => {
		queue.push({ httpStatus: 401, payload: {} })
		await expect(makeProvider().fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'config_missing' })
	})

	it('classifies bare 504 as timeout', async () => {
		queue.push({ httpStatus: 504, payload: {} })
		await expect(makeProvider().fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'timeout' })
	})

	it('classifies bare 5xx as http_5xx', async () => {
		queue.push({ httpStatus: 502, payload: {} })
		await expect(makeProvider().fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'http_5xx' })
	})

	it('classifies bare 4xx as http_4xx', async () => {
		queue.push({ httpStatus: 422, payload: {} })
		await expect(makeProvider().fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'http_4xx' })
	})

	it('throws invalid_response on non-JSON body', async () => {
		queue.push({ httpStatus: 200, rawText: '{ not json' })
		await expect(makeProvider().fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'invalid_response' })
	})
})

describe('wishListScraperProvider: body checks on success', () => {
	it('throws invalid_response on empty html', async () => {
		queue.push({ httpStatus: 200, payload: { html: '', status: 200 } })
		await expect(makeProvider().fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'invalid_response' })
	})

	it('throws bot_block when html looks like a CF wall (defensive)', async () => {
		// The facade should already classify this server-side, but if it
		// somehow returned a 200 with a wall body we still catch it.
		queue.push({ httpStatus: 200, payload: { html: '<html><body>cf-browser-verification</body></html>', status: 200 } })
		await expect(makeProvider().fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'bot_block' })
	})
})
