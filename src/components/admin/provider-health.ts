import type { ScrapeFailureRow, ScrapeProviderStat } from '@/api/admin-scrapes'

// Flags scrape providers that are failing badly enough that an admin should
// look at them. Built from the Scrape Health stats (attempt rows only; a
// run's final merged row is not a provider attempt). A provider that never
// succeeds, like a custom endpoint answering in the wrong shape, used to be
// visible only as a fail-rate number nobody was looking at; now it gets a
// badge on its own card.
//
//   - dead:    10+ attempts and none succeeded
//   - failing: 10+ attempts and at least half failed
//
// Fewer than 10 attempts is not enough to judge, so it gets no badge.

export const HEALTH_MIN_ATTEMPTS = 10
export const FAILING_RATE = 0.5

export type ProviderHealth = {
	status: 'dead' | 'failing'
	total: number
	okCount: number
	failRate: number
	// Most common errorCode among this provider's failures, when the failure
	// feed has any.
	topErrorCode: string | null
}

// Keyed by scraperId (`custom-http:abc`, `fetch-provider`). Healthy
// providers and providers without enough data are absent.
export function buildProviderHealth(
	providers: ReadonlyArray<ScrapeProviderStat>,
	failures: ReadonlyArray<ScrapeFailureRow>
): Map<string, ProviderHealth> {
	const errorCounts = new Map<string, Map<string, number>>()
	for (const f of failures) {
		if (!f.errorCode) continue
		const byCode = errorCounts.get(f.scraperId) ?? new Map<string, number>()
		byCode.set(f.errorCode, (byCode.get(f.errorCode) ?? 0) + 1)
		errorCounts.set(f.scraperId, byCode)
	}

	const out = new Map<string, ProviderHealth>()
	for (const p of providers) {
		if (p.total < HEALTH_MIN_ATTEMPTS) continue
		const failRate = p.failCount / p.total
		const status = p.okCount === 0 ? 'dead' : failRate >= FAILING_RATE ? 'failing' : null
		if (!status) continue
		let topErrorCode: string | null = null
		let topCount = 0
		for (const [code, n] of errorCounts.get(p.scraperId) ?? []) {
			if (n > topCount) {
				topErrorCode = code
				topCount = n
			}
		}
		out.set(p.scraperId, { status, total: p.total, okCount: p.okCount, failRate, topErrorCode })
	}
	return out
}

export function describeProviderHealth(health: ProviderHealth, windowLabel: string): { label: string; detail: string } {
	const why = health.topErrorCode ? `, mostly ${health.topErrorCode}` : ''
	if (health.status === 'dead') {
		return {
			label: 'Never succeeds',
			detail: `0 of ${health.total.toLocaleString()} attempts succeeded ${windowLabel}${why}.`,
		}
	}
	const pct = Math.round(health.failRate * 100)
	return {
		label: `Failing ${pct}%`,
		detail: `${health.okCount.toLocaleString()} of ${health.total.toLocaleString()} attempts succeeded ${windowLabel}${why}.`,
	}
}
