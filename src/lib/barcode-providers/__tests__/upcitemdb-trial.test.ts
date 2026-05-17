import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createUpcItemDbTrialProvider } from '../upcitemdb-trial'

let queue: Array<{ status: number; body?: unknown; throws?: Error }> = []
let lastUrl: string | null = null

beforeEach(() => {
	queue = []
	lastUrl = null
	vi.stubGlobal('fetch', (input: RequestInfo) => {
		const next = queue.shift()
		if (!next) throw new Error('fetch called more than expected')
		if (next.throws) throw next.throws
		lastUrl = typeof input === 'string' ? input : input.url
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

describe('upcitemdb-trial provider', () => {
	it('hits the trial endpoint with the GTIN as a query param', async () => {
		queue.push({ status: 200, body: { items: [{ title: 'Test', images: ['https://x/y.jpg'] }] } })
		const p = createUpcItemDbTrialProvider()
		await p.lookup('00012993441012', makeSignal())
		expect(lastUrl).toBe('https://api.upcitemdb.com/prod/trial/lookup?upc=00012993441012')
	})

	it('maps multiple items into multiple ProviderResults', async () => {
		queue.push({
			status: 200,
			body: {
				items: [
					{ title: 'First', brand: 'Brand A', images: ['https://x/1.jpg'], offers: [{ link: 'https://other.com/a', domain: 'other.com' }] },
					{ title: 'Second', images: ['https://x/2.jpg'], offers: [{ link: 'https://amazon.com/b', domain: 'amazon.com' }] },
				],
			},
		})
		const p = createUpcItemDbTrialProvider()
		const out = await p.lookup('00012993441012', makeSignal())
		expect(out).toEqual([
			{ title: 'First', brand: 'Brand A', imageUrl: 'https://x/1.jpg', candidateUrl: 'https://other.com/a' },
			{ title: 'Second', imageUrl: 'https://x/2.jpg', candidateUrl: 'https://amazon.com/b' },
		])
	})

	it('prefers an amazon.com offer link over other domains', async () => {
		queue.push({
			status: 200,
			body: {
				items: [
					{
						title: 'X',
						offers: [
							{ link: 'https://target.com/a', domain: 'target.com' },
							{ link: 'https://amazon.com/a', domain: 'amazon.com' },
						],
					},
				],
			},
		})
		const p = createUpcItemDbTrialProvider()
		const out = await p.lookup('00012993441012', makeSignal())
		expect(out?.[0].candidateUrl).toBe('https://amazon.com/a')
	})

	it('returns null on HTTP 404', async () => {
		queue.push({ status: 404, body: {} })
		const p = createUpcItemDbTrialProvider()
		expect(await p.lookup('00012993441012', makeSignal())).toBeNull()
	})

	it('returns null when items[] is empty', async () => {
		queue.push({ status: 200, body: { total: 0, items: [] } })
		const p = createUpcItemDbTrialProvider()
		expect(await p.lookup('00012993441012', makeSignal())).toBeNull()
	})

	it('throws on HTTP 500 (provider-unavailable)', async () => {
		queue.push({ status: 500, body: {} })
		const p = createUpcItemDbTrialProvider()
		await expect(p.lookup('00012993441012', makeSignal())).rejects.toThrow()
	})

	it('throws on HTTP 429 (rate limited)', async () => {
		queue.push({ status: 429, body: {} })
		const p = createUpcItemDbTrialProvider()
		await expect(p.lookup('00012993441012', makeSignal())).rejects.toThrow()
	})
})
