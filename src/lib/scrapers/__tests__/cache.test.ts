import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({
	env: { LOG_LEVEL: 'silent', LOG_PRETTY: false, BETTER_AUTH_SECRET: 'test-secret' },
}))

import type { Database } from '@/db'

import { loadCachedScrape, persistScrapeAttempt } from '../cache'

// ---------------------------------------------------------------------------
// Mock database
// ---------------------------------------------------------------------------
//
// The tests poke at the chained Drizzle API directly. `selectRows` queues
// what the next `.limit()` should resolve to; `insertCalls` captures every
// row passed to `.insert(table).values(row)` so we can assert the shape.

type FakeRow = {
	scraperId: string
	score: number | null
	title: string | null
	cleanTitle: string | null
	description: string | null
	price: string | null
	currency: string | null
	imageUrls: Array<string> | null
}

let selectRows: Array<FakeRow> = []
let insertCalls: Array<Record<string, unknown>> = []

const fakeDb = {
	select: () => ({
		from: () => ({
			where: () => ({
				orderBy: () => ({
					limit: () => Promise.resolve(selectRows),
				}),
			}),
		}),
	}),
	insert: () => ({
		values: (row: Record<string, unknown>) => {
			insertCalls.push(row)
			return Promise.resolve()
		},
	}),
} as unknown as Database

beforeEach(() => {
	selectRows = []
	insertCalls = []
})

afterEach(() => {
	vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// loadCachedScrape
// ---------------------------------------------------------------------------

describe('loadCachedScrape: short-circuits', () => {
	it('returns null without querying when ttlHours is 0 (caching disabled)', async () => {
		const querySpy = vi.fn(() => ({
			from: () => ({
				where: () => ({
					orderBy: () => ({ limit: () => Promise.resolve([]) }),
				}),
			}),
		}))
		const watchedDb = { ...fakeDb, select: querySpy } as unknown as Database
		const result = await loadCachedScrape(watchedDb, 'https://x.test/y', { ttlHours: 0, minScore: 3 })
		expect(result).toBeNull()
		expect(querySpy).not.toHaveBeenCalled()
	})

	it('returns null when no rows match', async () => {
		selectRows = []
		const result = await loadCachedScrape(fakeDb, 'https://x.test/y', { ttlHours: 24, minScore: 3 })
		expect(result).toBeNull()
	})

	it('returns null when the most recent row scored below minScore', async () => {
		selectRows = [
			{
				scraperId: 'fetch-provider',
				score: 2, // below minScore=3
				title: 'Low quality',
				cleanTitle: null,
				description: null,
				price: null,
				currency: null,
				imageUrls: null,
			},
		]
		const result = await loadCachedScrape(fakeDb, 'https://x.test/y', { ttlHours: 24, minScore: 3 })
		expect(result).toBeNull()
	})

	it('treats a null score as below threshold', async () => {
		selectRows = [
			{
				scraperId: 'fetch-provider',
				score: null,
				title: 'Untrust',
				cleanTitle: null,
				description: null,
				price: null,
				currency: null,
				imageUrls: null,
			},
		]
		const result = await loadCachedScrape(fakeDb, 'https://x.test/y', { ttlHours: 24, minScore: 3 })
		expect(result).toBeNull()
	})
})

describe('loadCachedScrape: row reconstruction', () => {
	it('rebuilds a ScrapeResult from the columns when score clears the threshold', async () => {
		selectRows = [
			{
				scraperId: 'fetch-provider',
				score: 5,
				title: 'Original title',
				cleanTitle: 'Clean title',
				description: 'A description',
				price: '29.99',
				currency: 'USD',
				imageUrls: ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg'],
			},
		]
		const result = await loadCachedScrape(fakeDb, 'https://x.test/y', { ttlHours: 24, minScore: 3 })
		expect(result).not.toBeNull()
		expect(result?.fromProvider).toBe('fetch-provider')
		expect(result?.result.title).toBe('Clean title') // cleanTitle wins over title
		expect(result?.result.description).toBe('A description')
		expect(result?.result.price).toBe('29.99')
		expect(result?.result.currency).toBe('USD')
		expect(result?.result.imageUrls).toEqual(['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg'])
		expect(result?.result.finalUrl).toBe('https://x.test/y')
	})

	it('falls back to title when cleanTitle is null', async () => {
		selectRows = [
			{
				scraperId: 'fetch-provider',
				score: 5,
				title: 'Plain title',
				cleanTitle: null,
				description: null,
				price: null,
				currency: null,
				imageUrls: null,
			},
		]
		const result = await loadCachedScrape(fakeDb, 'https://x.test/y', { ttlHours: 24, minScore: 3 })
		expect(result?.result.title).toBe('Plain title')
		expect(result?.result.imageUrls).toEqual([])
		expect(result?.result.description).toBeUndefined()
	})

	it('exactly at the score threshold counts as cached', async () => {
		selectRows = [
			{
				scraperId: 'fetch-provider',
				score: 3, // == minScore
				title: 'Borderline',
				cleanTitle: null,
				description: null,
				price: null,
				currency: null,
				imageUrls: [],
			},
		]
		const result = await loadCachedScrape(fakeDb, 'https://x.test/y', { ttlHours: 24, minScore: 3 })
		expect(result).not.toBeNull()
		expect(result?.result.title).toBe('Borderline')
	})
})

// ---------------------------------------------------------------------------
// persistScrapeAttempt
// ---------------------------------------------------------------------------

describe('persistScrapeAttempt: insert shape', () => {
	it('persists a successful attempt with all the fields the orchestrator passes', async () => {
		await persistScrapeAttempt(fakeDb, {
			itemId: 42,
			url: 'https://x.test/y',
			providerId: 'fetch-provider',
			ok: true,
			score: 5,
			ms: 423,
			result: {
				title: 'ACME',
				description: 'Stuff',
				price: '9.99',
				currency: 'USD',
				imageUrls: ['https://cdn.test/x.jpg'],
				finalUrl: 'https://x.test/y',
			},
			rawResponse: { kind: 'html', status: 200 },
		})
		expect(insertCalls).toHaveLength(1)
		const row = insertCalls[0]
		expect(row.itemId).toBe(42)
		expect(row.url).toBe('https://x.test/y')
		expect(row.scraperId).toBe('fetch-provider')
		expect(row.ok).toBe(true)
		expect(row.score).toBe(5)
		expect(row.ms).toBe(423)
		expect(row.errorCode).toBeNull()
		expect(row.title).toBe('ACME')
		expect(row.description).toBe('Stuff')
		expect(row.price).toBe('9.99')
		expect(row.currency).toBe('USD')
		expect(row.imageUrls).toEqual(['https://cdn.test/x.jpg'])
		// `response` is wrapped via Drizzle's sql helper; its presence (not
		// strict equality) is what we care about here.
		expect(row.response).toBeDefined()
		expect(row.response).not.toBeNull()
	})

	it('writes itemId as null when none is provided (the form-prefill flow)', async () => {
		await persistScrapeAttempt(fakeDb, {
			url: 'https://x.test/y',
			providerId: 'fetch-provider',
			ok: true,
			score: 4,
			ms: 200,
			result: { imageUrls: [] },
		})
		expect(insertCalls[0].itemId).toBeNull()
	})

	it('persists a failed attempt with errorCode and null score/result fields', async () => {
		await persistScrapeAttempt(fakeDb, {
			url: 'https://x.test/y',
			providerId: 'fetch-provider',
			ok: false,
			score: null,
			ms: 12,
			errorCode: 'bot_block',
		})
		const row = insertCalls[0]
		expect(row.ok).toBe(false)
		expect(row.score).toBeNull()
		expect(row.errorCode).toBe('bot_block')
		expect(row.title).toBeNull()
		expect(row.description).toBeNull()
		expect(row.price).toBeNull()
		expect(row.currency).toBeNull()
		expect(row.imageUrls).toBeNull()
		expect(row.response).toBeNull()
	})

	it('writes response as null when no rawResponse is supplied', async () => {
		await persistScrapeAttempt(fakeDb, {
			url: 'https://x.test/y',
			providerId: 'fetch-provider',
			ok: true,
			score: 4,
			ms: 200,
			result: { title: 'Hello', imageUrls: [] },
		})
		expect(insertCalls[0].response).toBeNull()
	})
})
