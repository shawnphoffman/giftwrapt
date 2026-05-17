import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createGoUpcProvider } from '../go-upc'

let queue: Array<{ status: number; body?: unknown }> = []
let lastUrl: string | null = null
let lastAuth: string | null = null

beforeEach(() => {
	queue = []
	lastUrl = null
	lastAuth = null
	vi.stubGlobal('fetch', (input: RequestInfo, init?: RequestInit) => {
		const next = queue.shift()
		if (!next) throw new Error('fetch called more than expected')
		lastUrl = typeof input === 'string' ? input : input.url
		const headers = init?.headers as Record<string, string> | undefined
		lastAuth = headers?.authorization ?? null
		return Promise.resolve(
			new Response(next.body === undefined ? '' : JSON.stringify(next.body), {
				status: next.status,
				headers: { 'content-type': 'application/json' },
			})
		)
	})
})

afterEach(() => {
	vi.unstubAllGlobals()
})

function makeSignal(): AbortSignal {
	return new AbortController().signal
}

describe('go-upc provider', () => {
	it('reports unavailable when the key is empty', () => {
		expect(createGoUpcProvider('').isAvailable()).toBe(false)
		expect(createGoUpcProvider('  ').isAvailable()).toBe(false)
		expect(createGoUpcProvider('goupc_xxx').isAvailable()).toBe(true)
	})

	it('sends the bearer header and hits the code endpoint', async () => {
		queue.push({ status: 200, body: { product: { name: 'Widget' } } })
		const p = createGoUpcProvider('goupc_xxx')
		await p.lookup('00012993441012', makeSignal())
		expect(lastUrl).toBe('https://go-upc.com/api/v1/code/00012993441012')
		expect(lastAuth).toBe('Bearer goupc_xxx')
	})

	it('wraps a single product into a one-element array', async () => {
		queue.push({
			status: 200,
			body: { product: { name: 'Widget', brand: 'Brand', imageUrl: 'https://x/y.jpg', url: 'https://go-upc.com/p/123' } },
		})
		const p = createGoUpcProvider('goupc_xxx')
		const out = await p.lookup('00012993441012', makeSignal())
		expect(out).toEqual([{ title: 'Widget', brand: 'Brand', imageUrl: 'https://x/y.jpg', candidateUrl: 'https://go-upc.com/p/123' }])
	})

	it('returns null on HTTP 404', async () => {
		queue.push({ status: 404, body: {} })
		const p = createGoUpcProvider('goupc_xxx')
		expect(await p.lookup('00012993441012', makeSignal())).toBeNull()
	})

	it('returns null when the product has no useful fields', async () => {
		queue.push({ status: 200, body: { product: { name: '', brand: '', imageUrl: '' } } })
		const p = createGoUpcProvider('goupc_xxx')
		expect(await p.lookup('00012993441012', makeSignal())).toBeNull()
	})

	it('throws on non-404, non-2xx (provider-unavailable)', async () => {
		queue.push({ status: 500, body: {} })
		const p = createGoUpcProvider('goupc_xxx')
		await expect(p.lookup('00012993441012', makeSignal())).rejects.toThrow()
	})
})
