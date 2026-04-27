import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({
	env: {
		LOG_LEVEL: 'silent',
		LOG_PRETTY: false,
		BETTER_AUTH_SECRET: 'test-secret',
	},
}))

import type { ScrapeContext } from '../../types'
import { createCustomHttpProvider, type CustomHttpEntry, customHttpProviderId } from '../custom-http'

function silentLogger(): ScrapeContext['logger'] {
	const noop = () => {}
	const fn = noop as unknown as ScrapeContext['logger']
	return new Proxy({} as object, { get: (_, p) => (p === 'child' ? () => fn : noop) }) as ScrapeContext['logger']
}

function makeCtx(url: string): ScrapeContext {
	return { url, signal: new AbortController().signal, logger: silentLogger(), perAttemptTimeoutMs: 5000 }
}

const sampleEntry: CustomHttpEntry = {
	type: 'custom-http',
	id: 'amzn',
	name: 'My Amazon scraper',
	enabled: true,
	tier: 1,
	endpoint: 'https://my-scraper.test/scrape',
	responseKind: 'html',
}

let queue: Array<{ status: number; body?: string; contentType?: string }> = []
let lastFetchInit: { method?: string; headers: Record<string, string>; url: string } | null = null

beforeEach(() => {
	queue = []
	lastFetchInit = null
	vi.stubGlobal('fetch', (input: RequestInfo, init?: RequestInit) => {
		const next = queue.shift()
		if (!next) throw new Error('fetch called more times than queued responses')
		const url = typeof input === 'string' ? input : input.url
		lastFetchInit = {
			method: init?.method,
			headers: (init?.headers as Record<string, string> | undefined) ?? {},
			url,
		}
		const body = next.body ?? ''
		return Promise.resolve(
			new Response(body, {
				status: next.status,
				headers: { 'content-type': next.contentType ?? 'text/html' },
			})
		)
	})
})

afterEach(() => {
	vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// Provider id namespacing
// ---------------------------------------------------------------------------

describe('customHttpProviderId', () => {
	it("namespaces the entry id under custom-http: so it can't collide with built-ins", () => {
		expect(customHttpProviderId('amzn')).toBe('custom-http:amzn')
		expect(customHttpProviderId('etsy-fallback')).toBe('custom-http:etsy-fallback')
	})
})

// ---------------------------------------------------------------------------
// createCustomHttpProvider: html mode
// ---------------------------------------------------------------------------

describe('createCustomHttpProvider: html mode', () => {
	it('appends url query param and returns RawPage with the namespaced id', async () => {
		queue.push({ status: 200, body: '<html><body>hello</body></html>' })
		const provider = createCustomHttpProvider(sampleEntry)
		const result = await provider.fetch(makeCtx('https://target.test/x'))
		expect(result.kind).toBe('html')
		if (result.kind !== 'html') return
		expect(result.providerId).toBe('custom-http:amzn')
		expect(result.html).toContain('hello')
		expect(lastFetchInit?.url).toBe('https://my-scraper.test/scrape?url=https%3A%2F%2Ftarget.test%2Fx')
	})

	it('classifies 401 as config_missing (token rejected)', async () => {
		queue.push({ status: 401 })
		const provider = createCustomHttpProvider(sampleEntry)
		await expect(provider.fetch(makeCtx('https://target.test/x'))).rejects.toMatchObject({ code: 'config_missing' })
	})

	it('throws bot_block on a CF-walled body', async () => {
		queue.push({ status: 200, body: '<html><body>cf-browser-verification</body></html>' })
		const provider = createCustomHttpProvider(sampleEntry)
		await expect(provider.fetch(makeCtx('https://target.test/x'))).rejects.toMatchObject({ code: 'bot_block' })
	})
})

// ---------------------------------------------------------------------------
// createCustomHttpProvider: json mode
// ---------------------------------------------------------------------------

describe('createCustomHttpProvider: json mode', () => {
	const jsonEntry: CustomHttpEntry = { ...sampleEntry, responseKind: 'json' }

	it('parses a valid ScrapeResult-shaped body', async () => {
		queue.push({
			status: 200,
			body: JSON.stringify({
				title: 'My Widget',
				price: '9.99',
				currency: 'USD',
				imageUrls: ['https://cdn.test/x.jpg'],
			}),
			contentType: 'application/json',
		})
		const provider = createCustomHttpProvider(jsonEntry)
		const result = await provider.fetch(makeCtx('https://target.test/x'))
		expect(result.kind).toBe('structured')
		if (result.kind !== 'structured') return
		expect(result.providerId).toBe('custom-http:amzn')
		expect(result.result.title).toBe('My Widget')
		expect(result.result.imageUrls).toEqual(['https://cdn.test/x.jpg'])
		expect(result.result.finalUrl).toBe('https://target.test/x')
	})

	it('throws invalid_response on malformed JSON', async () => {
		queue.push({ status: 200, body: '{ not json', contentType: 'application/json' })
		const provider = createCustomHttpProvider(jsonEntry)
		await expect(provider.fetch(makeCtx('https://target.test/x'))).rejects.toMatchObject({ code: 'invalid_response' })
	})

	it('throws invalid_response when the JSON does not match the ScrapeResult shape', async () => {
		queue.push({ status: 200, body: JSON.stringify({ title: 99, imageUrls: 'not-an-array' }), contentType: 'application/json' })
		const provider = createCustomHttpProvider(jsonEntry)
		await expect(provider.fetch(makeCtx('https://target.test/x'))).rejects.toMatchObject({ code: 'invalid_response' })
	})
})

// ---------------------------------------------------------------------------
// createCustomHttpProvider: custom headers
// ---------------------------------------------------------------------------

describe('createCustomHttpProvider: custom headers', () => {
	it('attaches every parsed header from the multiline customHeaders field', async () => {
		const entry: CustomHttpEntry = {
			...sampleEntry,
			customHeaders: ['X-Token: shh', 'Authorization: Bearer abc', '# this comment is ignored', 'User-Agent: my-scraper/1.0'].join('\n'),
		}
		queue.push({ status: 200, body: '<html>ok</html>' })
		const provider = createCustomHttpProvider(entry)
		await provider.fetch(makeCtx('https://target.test/x'))
		expect(lastFetchInit?.headers['x-token']).toBe('shh')
		expect(lastFetchInit?.headers.authorization).toBe('Bearer abc')
		expect(lastFetchInit?.headers['user-agent']).toBe('my-scraper/1.0')
	})

	it('admin-supplied headers override the provider defaults', async () => {
		const entry: CustomHttpEntry = { ...sampleEntry, customHeaders: 'Accept: application/x-custom' }
		queue.push({ status: 200, body: '<html>ok</html>' })
		const provider = createCustomHttpProvider(entry)
		await provider.fetch(makeCtx('https://target.test/x'))
		expect(lastFetchInit?.headers.accept).toBe('application/x-custom')
	})

	it('sends only the default Accept when no custom headers are configured', async () => {
		queue.push({ status: 200, body: '<html>ok</html>' })
		const provider = createCustomHttpProvider(sampleEntry)
		await provider.fetch(makeCtx('https://target.test/x'))
		expect(Object.keys(lastFetchInit?.headers ?? {})).toEqual(['accept'])
		expect(lastFetchInit?.headers.accept).toContain('text/html')
	})
})
