import { describe, expect, it } from 'vitest'

import type { ScrapeFailureRow } from '@/api/admin-scrapes'

import { computeFailureAggregates, extractDomain } from '../scrape-stats'

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
			{ domain: 'amazon.com', count: 3, topErrorCode: 'timeout', topErrorCount: 2 },
			{ domain: 'etsy.com', count: 1, topErrorCode: 'timeout', topErrorCount: 1 },
		])
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
