import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({
	env: {
		LOG_LEVEL: 'silent',
		LOG_PRETTY: false,
		BETTER_AUTH_SECRET: 'test-secret',
	},
}))

let mockSettings: Record<string, unknown> = {}

vi.mock('@/db', () => {
	return {
		db: {
			select: () => ({ from: () => Promise.resolve(Object.entries(mockSettings).map(([key, value]) => ({ key, value }))) }),
		},
	}
})

import type { ScrapeContext } from '../../types'
import { customHttpProvider } from '../custom-http'

function silentLogger(): ScrapeContext['logger'] {
	const noop = () => {}
	const fn = noop as unknown as ScrapeContext['logger']
	return new Proxy({} as object, { get: (_, p) => (p === 'child' ? () => fn : noop) }) as ScrapeContext['logger']
}

function makeCtx(url: string): ScrapeContext {
	return { url, signal: new AbortController().signal, logger: silentLogger(), perAttemptTimeoutMs: 5000 }
}

let queue: Array<{ status: number; body?: string; contentType?: string }> = []
let lastFetchInit: { method?: string; headers: Record<string, string>; url: string } | null = null

beforeEach(() => {
	queue = []
	mockSettings = {}
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

describe('customHttpProvider: availability', () => {
	it('is unavailable when no config is set', async () => {
		await expect(Promise.resolve(customHttpProvider.isAvailable())).resolves.toBe(false)
	})

	it('is unavailable when configured but disabled', async () => {
		mockSettings.scrapeCustomHttpProvider = {
			enabled: false,
			endpoint: 'https://my-scraper.test/scrape',
			responseKind: 'html',
		}
		await expect(Promise.resolve(customHttpProvider.isAvailable())).resolves.toBe(false)
	})

	it('is available when configured and enabled with a valid endpoint', async () => {
		mockSettings.scrapeCustomHttpProvider = {
			enabled: true,
			endpoint: 'https://my-scraper.test/scrape',
			responseKind: 'html',
		}
		await expect(Promise.resolve(customHttpProvider.isAvailable())).resolves.toBe(true)
	})

	it('is unavailable when enabled with an empty endpoint (toggle on, URL not yet typed)', async () => {
		mockSettings.scrapeCustomHttpProvider = {
			enabled: true,
			endpoint: '',
			responseKind: 'html',
		}
		await expect(Promise.resolve(customHttpProvider.isAvailable())).resolves.toBe(false)
	})

	it('is unavailable when enabled with a non-http(s) endpoint', async () => {
		mockSettings.scrapeCustomHttpProvider = {
			enabled: true,
			endpoint: 'ftp://my-scraper.test/scrape',
			responseKind: 'html',
		}
		await expect(Promise.resolve(customHttpProvider.isAvailable())).resolves.toBe(false)
	})
})

describe('customHttpProvider: html mode', () => {
	beforeEach(() => {
		mockSettings.scrapeCustomHttpProvider = {
			enabled: true,
			endpoint: 'https://my-scraper.test/scrape',
			responseKind: 'html',
		}
	})

	it('appends url query param and returns RawPage', async () => {
		queue.push({ status: 200, body: '<html><body>hello</body></html>' })
		const result = await customHttpProvider.fetch(makeCtx('https://target.test/x'))
		expect(result.kind).toBe('html')
		if (result.kind !== 'html') return
		expect(result.html).toContain('hello')
		expect(lastFetchInit?.url).toBe('https://my-scraper.test/scrape?url=https%3A%2F%2Ftarget.test%2Fx')
	})

	it('classifies 401 as config_missing (token rejected)', async () => {
		queue.push({ status: 401 })
		await expect(customHttpProvider.fetch(makeCtx('https://target.test/x'))).rejects.toMatchObject({ code: 'config_missing' })
	})

	it('throws bot_block on a CF-walled body', async () => {
		queue.push({ status: 200, body: '<html><body>cf-browser-verification</body></html>' })
		await expect(customHttpProvider.fetch(makeCtx('https://target.test/x'))).rejects.toMatchObject({ code: 'bot_block' })
	})
})

describe('customHttpProvider: json mode', () => {
	beforeEach(() => {
		mockSettings.scrapeCustomHttpProvider = {
			enabled: true,
			endpoint: 'https://my-scraper.test/scrape',
			responseKind: 'json',
		}
	})

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
		const result = await customHttpProvider.fetch(makeCtx('https://target.test/x'))
		expect(result.kind).toBe('structured')
		if (result.kind !== 'structured') return
		expect(result.result.title).toBe('My Widget')
		expect(result.result.price).toBe('9.99')
		expect(result.result.imageUrls).toEqual(['https://cdn.test/x.jpg'])
		expect(result.result.finalUrl).toBe('https://target.test/x')
	})

	it('throws invalid_response on malformed JSON', async () => {
		queue.push({ status: 200, body: '{ not json', contentType: 'application/json' })
		await expect(customHttpProvider.fetch(makeCtx('https://target.test/x'))).rejects.toMatchObject({ code: 'invalid_response' })
	})

	it('throws invalid_response when the JSON does not match the ScrapeResult shape', async () => {
		queue.push({ status: 200, body: JSON.stringify({ title: 99, imageUrls: 'not-an-array' }), contentType: 'application/json' })
		await expect(customHttpProvider.fetch(makeCtx('https://target.test/x'))).rejects.toMatchObject({ code: 'invalid_response' })
	})
})

describe('customHttpProvider: custom headers', () => {
	it('attaches every parsed header from the multiline customHeaders field', async () => {
		mockSettings.scrapeCustomHttpProvider = {
			enabled: true,
			endpoint: 'https://my-scraper.test/scrape',
			responseKind: 'html',
			customHeaders: ['X-Token: shh', 'Authorization: Bearer abc', '# this comment is ignored', 'User-Agent: my-scraper/1.0'].join('\n'),
		}
		queue.push({ status: 200, body: '<html>ok</html>' })
		await customHttpProvider.fetch(makeCtx('https://target.test/x'))
		expect(lastFetchInit?.headers['x-token']).toBe('shh')
		expect(lastFetchInit?.headers.authorization).toBe('Bearer abc')
		expect(lastFetchInit?.headers['user-agent']).toBe('my-scraper/1.0')
	})

	it('admin-supplied headers override the provider defaults', async () => {
		// The provider sets `accept` based on responseKind; an admin who
		// configures their scraper to require a specific Accept can override.
		mockSettings.scrapeCustomHttpProvider = {
			enabled: true,
			endpoint: 'https://my-scraper.test/scrape',
			responseKind: 'html',
			customHeaders: 'Accept: application/x-custom',
		}
		queue.push({ status: 200, body: '<html>ok</html>' })
		await customHttpProvider.fetch(makeCtx('https://target.test/x'))
		expect(lastFetchInit?.headers.accept).toBe('application/x-custom')
	})

	it('sends only the default Accept when no custom headers are configured', async () => {
		mockSettings.scrapeCustomHttpProvider = {
			enabled: true,
			endpoint: 'https://my-scraper.test/scrape',
			responseKind: 'html',
		}
		queue.push({ status: 200, body: '<html>ok</html>' })
		await customHttpProvider.fetch(makeCtx('https://target.test/x'))
		expect(Object.keys(lastFetchInit?.headers ?? {})).toEqual(['accept'])
		expect(lastFetchInit?.headers.accept).toContain('text/html')
	})
})
