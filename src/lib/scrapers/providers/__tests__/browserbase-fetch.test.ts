import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({
	env: {
		LOG_LEVEL: 'silent',
		LOG_PRETTY: false,
		BETTER_AUTH_SECRET: 'test-secret',
	},
}))

import type { BrowserbaseFetchEntry } from '@/lib/settings'

import type { ScrapeContext, ScrapeProvider } from '../../types'
import { createBrowserbaseFetchProvider } from '../browserbase-fetch'

const TEST_ENTRY: BrowserbaseFetchEntry = {
	type: 'browserbase-fetch',
	id: 'test',
	name: 'Browserbase Fetch Test',
	enabled: true,
	tier: 1,
	apiKey: 'bb_key_123',
	proxies: true,
	allowRedirects: true,
}

function makeProvider(overrides: Partial<BrowserbaseFetchEntry> = {}): ScrapeProvider {
	return createBrowserbaseFetchProvider({ ...TEST_ENTRY, ...overrides })
}

function silentLogger(): ScrapeContext['logger'] {
	const noop = () => {}
	const fn = noop as unknown as ScrapeContext['logger']
	return new Proxy({} as object, { get: (_, p) => (p === 'child' ? () => fn : noop) }) as ScrapeContext['logger']
}

function makeCtx(url: string): ScrapeContext {
	return { url, signal: new AbortController().signal, logger: silentLogger(), perAttemptTimeoutMs: 5000 }
}

type FakeEnvelope = {
	id?: string
	statusCode?: number
	headers?: Record<string, string>
	content?: string
	contentType?: string
}

let queue: Array<{ httpStatus: number; envelope?: FakeEnvelope; rawText?: string }> = []
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
		const body = next.rawText ?? JSON.stringify(next.envelope ?? {})
		return Promise.resolve(new Response(body, { status: next.httpStatus, headers: { 'content-type': 'application/json' } }))
	})
})

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('browserbaseFetchProvider: availability', () => {
	it('is available when enabled with a non-empty apiKey', () => {
		expect(makeProvider().isAvailable()).toBe(true)
	})

	it('is NOT available when disabled', () => {
		expect(makeProvider({ enabled: false }).isAvailable()).toBe(false)
	})

	it('is NOT available when apiKey is empty', () => {
		expect(makeProvider({ apiKey: '' }).isAvailable()).toBe(false)
	})
})

describe('browserbaseFetchProvider: success path', () => {
	it('POSTs api.browserbase.com/v1/fetch with the URL and returns RawPage', async () => {
		queue.push({
			httpStatus: 200,
			envelope: {
				statusCode: 200,
				headers: { 'content-type': 'text/html; charset=utf-8' },
				content: '<html><body>rendered</body></html>',
				contentType: 'text/html; charset=utf-8',
			},
		})
		const result = await makeProvider().fetch(makeCtx('https://example.test/x'))
		expect(result.kind).toBe('html')
		if (result.kind !== 'html') return
		expect(result.providerId).toBe('browserbase-fetch:test')
		expect(result.html).toContain('rendered')
		expect(lastFetchInit?.method).toBe('POST')
		expect(lastFetchInit?.url).toBe('https://api.browserbase.com/v1/fetch')
		expect(lastFetchInit?.headers['X-BB-API-Key']).toBe('bb_key_123')
		const body = JSON.parse(lastFetchInit?.body ?? '{}') as { url: string; proxies: boolean; allowRedirects: boolean }
		expect(body.url).toBe('https://example.test/x')
		expect(body.proxies).toBe(true)
		expect(body.allowRedirects).toBe(true)
	})

	it('respects entry.proxies and entry.allowRedirects', async () => {
		queue.push({
			httpStatus: 200,
			envelope: { statusCode: 200, content: '<html>ok</html>', contentType: 'text/html' },
		})
		await makeProvider({ proxies: false, allowRedirects: false }).fetch(makeCtx('https://example.test/x'))
		const body = JSON.parse(lastFetchInit?.body ?? '{}') as { proxies: boolean; allowRedirects: boolean }
		expect(body.proxies).toBe(false)
		expect(body.allowRedirects).toBe(false)
	})
})

describe('browserbaseFetchProvider: failure modes', () => {
	it('classifies 401 from the Browserbase call as config_missing', async () => {
		queue.push({ httpStatus: 401 })
		await expect(makeProvider().fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'config_missing' })
	})

	it('classifies 504 as timeout', async () => {
		queue.push({ httpStatus: 504 })
		await expect(makeProvider().fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'timeout' })
	})

	it('classifies other 5xx as http_5xx', async () => {
		queue.push({ httpStatus: 502 })
		await expect(makeProvider().fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'http_5xx' })
	})

	it('throws invalid_response on malformed JSON envelope', async () => {
		queue.push({ httpStatus: 200, rawText: '{ not json' })
		await expect(makeProvider().fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'invalid_response' })
	})

	it('throws invalid_response on non-HTML content type', async () => {
		queue.push({
			httpStatus: 200,
			envelope: { statusCode: 200, content: '{"foo":"bar"}', contentType: 'application/json' },
		})
		await expect(makeProvider().fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'invalid_response' })
	})

	it('throws invalid_response on empty content', async () => {
		queue.push({
			httpStatus: 200,
			envelope: { statusCode: 200, content: '', contentType: 'text/html' },
		})
		await expect(makeProvider().fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'invalid_response' })
	})

	it('throws bot_block when content body looks blocked', async () => {
		queue.push({
			httpStatus: 200,
			envelope: { statusCode: 200, content: '<html><body>cf-browser-verification</body></html>', contentType: 'text/html' },
		})
		await expect(makeProvider().fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'bot_block' })
	})
})
