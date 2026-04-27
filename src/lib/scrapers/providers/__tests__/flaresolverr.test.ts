import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({
	env: {
		LOG_LEVEL: 'silent',
		LOG_PRETTY: false,
		BETTER_AUTH_SECRET: 'test-secret',
	},
}))

import type { FlaresolverrEntry } from '@/lib/settings'

import type { ScrapeContext, ScrapeProvider } from '../../types'
import { createFlaresolverrProvider } from '../flaresolverr'

const TEST_ENTRY: FlaresolverrEntry = {
	type: 'flaresolverr',
	id: 'test',
	name: 'Flaresolverr Test',
	enabled: true,
	tier: 1,
	url: 'http://flaresolverr.test:8191',
}

function makeProvider(overrides: Partial<FlaresolverrEntry> = {}): ScrapeProvider {
	return createFlaresolverrProvider({ ...TEST_ENTRY, ...overrides })
}

function silentLogger(): ScrapeContext['logger'] {
	const noop = () => {}
	const fn = noop as unknown as ScrapeContext['logger']
	return new Proxy({} as object, { get: (_, p) => (p === 'child' ? () => fn : noop) }) as ScrapeContext['logger']
}

function makeCtx(url: string): ScrapeContext {
	return { url, signal: new AbortController().signal, logger: silentLogger(), perAttemptTimeoutMs: 5000 }
}

type FakeJson = {
	status: 'ok' | 'error'
	message?: string
	solution?: { url?: string; status?: number; response?: string; userAgent?: string }
}
let queue: Array<{ httpStatus: number; json?: FakeJson; rawText?: string }> = []
let lastFetchInit: { method?: string; body?: string; url: string } | null = null

beforeEach(() => {
	queue = []
	lastFetchInit = null
	vi.stubGlobal('fetch', (input: RequestInfo, init?: RequestInit) => {
		const next = queue.shift()
		if (!next) throw new Error('fetch called more times than queued responses')
		const url = typeof input === 'string' ? input : input.url
		lastFetchInit = { method: init?.method, body: init?.body as string | undefined, url }
		const body = next.rawText ?? JSON.stringify(next.json ?? {})
		return Promise.resolve(new Response(body, { status: next.httpStatus, headers: { 'content-type': 'application/json' } }))
	})
})

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('flaresolverrProvider: availability', () => {
	it('is available when the entry is enabled and url is parseable', () => {
		expect(makeProvider().isAvailable()).toBe(true)
	})

	it('is NOT available when disabled', () => {
		expect(makeProvider({ enabled: false }).isAvailable()).toBe(false)
	})
})

describe('flaresolverrProvider: success path', () => {
	it('POSTs /v1 with cmd=request.get and returns RawPage', async () => {
		queue.push({
			httpStatus: 200,
			json: {
				status: 'ok',
				solution: { url: 'https://example.test/final', status: 200, response: '<html><body>hello</body></html>', userAgent: 'Mozilla/5.0' },
			},
		})
		const result = await makeProvider().fetch(makeCtx('https://example.test/x'))
		expect(result.kind).toBe('html')
		if (result.kind !== 'html') return
		expect(result.providerId).toBe('flaresolverr:test')
		expect(result.html).toContain('hello')
		expect(result.finalUrl).toBe('https://example.test/final')
		expect(lastFetchInit?.method).toBe('POST')
		expect(lastFetchInit?.url).toContain('/v1')
		const body = JSON.parse(lastFetchInit?.body ?? '{}') as { cmd: string; url: string }
		expect(body.cmd).toBe('request.get')
		expect(body.url).toBe('https://example.test/x')
	})
})

describe('flaresolverrProvider: failure modes', () => {
	it('classifies a Cloudflare error message as bot_block', async () => {
		queue.push({ httpStatus: 200, json: { status: 'error', message: 'ERROR: Cloudflare Turnstile not solvable' } })
		await expect(makeProvider().fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'bot_block' })
	})

	it('classifies other error messages as invalid_response', async () => {
		queue.push({ httpStatus: 200, json: { status: 'error', message: 'something else broke' } })
		await expect(makeProvider().fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'invalid_response' })
	})

	it('throws bot_block when the solution body looks blocked', async () => {
		queue.push({
			httpStatus: 200,
			json: { status: 'ok', solution: { url: 'x', status: 200, response: '<html>cf-browser-verification</html>' } },
		})
		await expect(makeProvider().fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'bot_block' })
	})

	it('classifies HTTP 5xx', async () => {
		queue.push({ httpStatus: 502 })
		await expect(makeProvider().fetch(makeCtx('https://example.test/x'))).rejects.toMatchObject({ code: 'http_5xx' })
	})
})
