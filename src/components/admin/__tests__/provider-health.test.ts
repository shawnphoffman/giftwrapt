import { describe, expect, it } from 'vitest'

import type { ScrapeFailureRow, ScrapeProviderStat } from '@/api/admin-scrapes'

import { buildProviderHealth, describeProviderHealth } from '../provider-health'

const stat = (scraperId: string, total: number, okCount: number): ScrapeProviderStat => ({
	scraperId,
	total,
	okCount,
	failCount: total - okCount,
	avgMs: null,
	p95Ms: null,
})
const failure = (scraperId: string, errorCode: string | null): ScrapeFailureRow => ({
	url: 'https://x.test/p',
	scraperId,
	errorCode,
	ms: 100,
	createdAt: new Date('2026-10-01T00:00:00Z'),
})

describe('buildProviderHealth', () => {
	it('flags a provider that never succeeded, with its most common error', () => {
		const health = buildProviderHealth(
			[stat('custom-http:shawn', 48, 0)],
			[failure('custom-http:shawn', 'timeout'), failure('custom-http:shawn', 'timeout'), failure('custom-http:shawn', 'invalid_response')]
		)
		expect(health.get('custom-http:shawn')).toEqual({ status: 'dead', total: 48, okCount: 0, failRate: 1, topErrorCode: 'timeout' })
	})

	it('flags a provider failing half or more of the time', () => {
		expect(buildProviderHealth([stat('scrapfly:sf', 30, 15)], []).get('scrapfly:sf')).toMatchObject({
			status: 'failing',
			topErrorCode: null,
		})
	})

	it('leaves healthy providers and providers with too few attempts alone', () => {
		const health = buildProviderHealth([stat('fetch-provider', 200, 150), stat('ai:x', 9, 0)], [])
		expect(health.size).toBe(0)
	})
})

describe('describeProviderHealth', () => {
	it('words a dead provider and a failing one', () => {
		expect(
			describeProviderHealth({ status: 'dead', total: 48, okCount: 0, failRate: 1, topErrorCode: 'timeout' }, 'in the last 30 days')
		).toEqual({
			label: 'Never succeeds',
			detail: '0 of 48 attempts succeeded in the last 30 days, mostly timeout.',
		})
		expect(
			describeProviderHealth({ status: 'failing', total: 30, okCount: 14, failRate: 16 / 30, topErrorCode: null }, 'in the last 7 days')
		).toEqual({
			label: 'Failing 53%',
			detail: '14 of 30 attempts succeeded in the last 7 days.',
		})
	})
})
