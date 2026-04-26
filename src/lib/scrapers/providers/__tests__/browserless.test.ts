import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({
	env: {
		LOG_LEVEL: 'silent',
		LOG_PRETTY: false,
		BETTER_AUTH_SECRET: 'test-secret',
		BROWSERLESS_URL: 'http://browserless.test:3000',
		BROWSER_TOKEN: 'test-token',
	},
}))

import type { ScrapeContext } from '../../types'
import { browserlessProvider } from '../browserless'

function silentLogger(): ScrapeContext['logger'] {
	const noop = () => {}
	const fn = noop as unknown as ScrapeContext['logger']
	return new Proxy({} as object, { get: (_, p) => (p === 'child' ? () => fn : noop) }) as ScrapeContext['logger']
}

function makeCtx(url: string): ScrapeContext {
	return { url, signal: new AbortController().signal, logger: silentLogger(), perAttemptTimeoutMs: 5000 }
}

let queue: Array<{ status: number; body?: string; throws?: Error }> = []
let lastFetchInit: { method?: string; body?: string; headers: Record<string, string>; url: string } | null = null

beforeEach(() => {
	queue = []
	lastFetchInit = null
	vi.stubGlobal('fetch', (input: RequestInfo, init?: RequestInit) => {
		const next = queue.shift()
		if (!next) throw new Error('fetch called more times than queued responses')
		if (next.throws) throw next.throws
		const url = typeof input === 'string' ? input : input.url
		const headersIn = init?.headers as Record<string, string> | undefined
		lastFetchInit = {
			method: init?.method,
			body: init?.body as string | undefined,
			headers: headersIn ?? {},
			url,
		}
		const headers = new Headers({ 'content-type': 'text/html; charset=utf-8' })
		const body = next.body ?? ''
		const stream = new ReadableStream<Uint8Array>({
			start(ctrl) {
				ctrl.enqueue(new TextEncoder().encode(body))
				ctrl.close()
			},
		})
		return Promise.resolve(new Response(stream, { status: next.status, headers }))
	})
})

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('browserlessProvider: availability', () => {
	it('is available when BROWSERLESS_URL is set', async () => {
		await expect(Promise.resolve(browserlessProvider.isAvailable())).resolves.toBe(true)
	})
})

describe('browserlessProvider: success path', () => {
	it('POSTs /content with the URL and returns RawPage', async () => {
		queue.push({ status: 200, body: '<html><body>rendered</body></html>' })
		const result = await browserlessProvider.fetch(makeCtx('https://example.test/x'))
		expect(result.kind).toBe('html')
		if (result.kind !== 'html') return
		expect(result.providerId).toBe('browserless-provider')
		expect(result.html).toContain('rendered')
		expect(lastFetchInit?.method).toBe('POST')
		expect(lastFetchInit?.url).toContain('/content')
		expect(lastFetchInit?.url).toContain('token=test-token')
		const body = JSON.parse(lastFetchInit?.body ?? '{}') as { url: string }
		expect(body.url).toBe('https://example.test/x')
	})
})

describe('browserlessProvider: failure modes', () => {
	it('classifies 401/403 as config_missing', async () => {
		queue.push({ status: 401 })
		await expect(browserlessProvider.fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'config_missing' })
	})

	it('classifies 408/504 as timeout', async () => {
		queue.push({ status: 504 })
		await expect(browserlessProvider.fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'timeout' })
	})

	it('classifies other 5xx as http_5xx', async () => {
		queue.push({ status: 502 })
		await expect(browserlessProvider.fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'http_5xx' })
	})

	it('throws bot_block when the rendered body looks blocked', async () => {
		queue.push({ status: 200, body: '<html><body>cf-browser-verification</body></html>' })
		await expect(browserlessProvider.fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'bot_block' })
	})

	it('throws invalid_response on an empty body', async () => {
		queue.push({ status: 200, body: '' })
		await expect(browserlessProvider.fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'invalid_response' })
	})
})
