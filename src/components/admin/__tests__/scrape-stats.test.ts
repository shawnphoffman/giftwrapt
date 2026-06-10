import { describe, expect, it } from 'vitest'

import type { ScrapeFailureRow } from '@/api/admin-scrapes'
import type { ScrapeProviderEntry } from '@/lib/settings'

import { buildScraperLookups, computeFailureAggregates, extractDomain } from '../scrape-stats'

function providerEntry(partial: Partial<ScrapeProviderEntry> & { id: string; name: string; tier: number }): ScrapeProviderEntry {
	return {
		type: 'flaresolverr',
		enabled: true,
		url: '',
		...partial,
	} as ScrapeProviderEntry
}

function failure(url: string, errorCode: string | null): ScrapeFailureRow {
	return { url, errorCode, scraperId: 'fetch:default', ms: null, createdAt: new Date('2026-05-01T00:00:00Z') }
}

describe('extractDomain', () => {
	it('strips www. and lowercases the host', () => {
		expect(extractDomain('https://www.Amazon.com/dp/B0001')).toBe('amazon.com')
	})

	it('keeps non-www subdomains intact', () => {
		expect(extractDomain('https://smile.amazon.com/dp/B0001')).toBe('smile.amazon.com')
	})

	it('ignores ports, paths, query strings, and hash', () => {
		expect(extractDomain('https://shop.example.com:8443/cart?ref=foo#x')).toBe('shop.example.com')
	})

	it('returns a sentinel for unparseable URLs instead of throwing', () => {
		expect(extractDomain('not a url')).toBe('(unparseable)')
	})
})

describe('computeFailureAggregates', () => {
	it('groups by domain, surfaces the most common error per domain, and sorts by failure count desc', () => {
		const failures: Array<ScrapeFailureRow> = [
			failure('https://www.amazon.com/dp/A', 'timeout'),
			failure('https://amazon.com/dp/B', 'timeout'),
			failure('https://www.amazon.com/dp/C', 'http-403'),
			failure('https://www.etsy.com/listing/1', 'timeout'),
		]
		const { domains } = computeFailureAggregates(failures)
		expect(domains).toEqual([
			{
				domain: 'amazon.com',
				count: 3,
				topErrorCode: 'timeout',
				topErrorCount: 2,
				urls: ['https://www.amazon.com/dp/A', 'https://amazon.com/dp/B', 'https://www.amazon.com/dp/C'],
			},
			{ domain: 'etsy.com', count: 1, topErrorCode: 'timeout', topErrorCount: 1, urls: ['https://www.etsy.com/listing/1'] },
		])
	})

	it('dedupes URLs per domain so the copy dialog only shows unique examples', () => {
		const failures: Array<ScrapeFailureRow> = [
			failure('https://www.amazon.com/dp/A', 'timeout'),
			failure('https://www.amazon.com/dp/A', 'timeout'),
			failure('https://amazon.com/dp/B', 'http-403'),
		]
		const { domains } = computeFailureAggregates(failures)
		expect(domains[0].urls).toEqual(['https://www.amazon.com/dp/A', 'https://amazon.com/dp/B'])
	})

	it("falls back to 'unknown' when errorCode is null", () => {
		const { errorCodes } = computeFailureAggregates([
			failure('https://x.com', null),
			failure('https://y.com', null),
			failure('https://z.com', 'timeout'),
		])
		expect(errorCodes).toEqual([
			{ code: 'unknown', count: 2 },
			{ code: 'timeout', count: 1 },
		])
	})

	it('caps the domain and error-code tables at 15 rows each', () => {
		const failures: Array<ScrapeFailureRow> = []
		for (let i = 0; i < 25; i++) {
			failures.push(failure(`https://domain-${i}.com/x`, `err-${i}`))
		}
		const { domains, errorCodes } = computeFailureAggregates(failures)
		expect(domains).toHaveLength(15)
		expect(errorCodes).toHaveLength(15)
	})

	it('returns empty arrays for an empty failure list', () => {
		expect(computeFailureAggregates([])).toEqual({ domains: [], errorCodes: [] })
	})
})

describe('buildScraperLookups', () => {
	const entries: Array<ScrapeProviderEntry> = [
		providerEntry({ type: 'browserless', id: 'bl-1', name: 'Browserless Primary', tier: 1, url: '' }),
		providerEntry({ type: 'scrapfly', id: 'sf-1', name: 'ScrapFly', tier: 2, apiKey: '' } as Partial<ScrapeProviderEntry> & {
			id: string
			name: string
			tier: number
		}),
	]

	it('treats the built-in fetch-provider as implicit tier 0', () => {
		const { tierFor, labelFor, currentScraperIds } = buildScraperLookups(entries)
		expect(tierFor('fetch-provider')).toBe(0)
		expect(labelFor('fetch-provider')).toBe('Built-in')
		expect(currentScraperIds.has('fetch-provider')).toBe(true)
	})

	it('resolves configured entries by ${type}:${id} key with their admin-set name and tier', () => {
		const { tierFor, labelFor } = buildScraperLookups(entries)
		expect(tierFor('browserless:bl-1')).toBe(1)
		expect(labelFor('browserless:bl-1')).toBe('Browserless Primary')
		expect(tierFor('scrapfly:sf-1')).toBe(2)
	})

	it('returns null tier and the raw id when the scraper is no longer configured', () => {
		const { tierFor, labelFor } = buildScraperLookups(entries)
		expect(tierFor('browserless:gone')).toBeNull()
		expect(labelFor('browserless:gone')).toBe('browserless:gone')
	})

	it('labels and tiers merged ids using their first known contributor', () => {
		const { tierFor, labelFor } = buildScraperLookups(entries)
		expect(tierFor('merged:browserless:bl-1,scrapfly:sf-1')).toBe(1)
		expect(labelFor('merged:browserless:bl-1,scrapfly:sf-1')).toBe('Browserless Primary + ScrapFly (merged)')
	})
})
