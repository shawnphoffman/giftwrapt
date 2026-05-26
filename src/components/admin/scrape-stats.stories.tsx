import type { Meta, StoryObj } from '@storybook/react-vite'

import type { ScrapeFailureRow, ScrapeProviderStat, ScrapeStats } from '@/api/admin-scrapes'
import type { ScrapeProviderEntry } from '@/lib/settings'

import { ScrapeStatsView } from './scrape-stats'

const generatedAt = new Date('2026-05-25T12:00:00Z')

const providers: Array<ScrapeProviderEntry> = [
	{ type: 'browserless', id: 'bl-primary', name: 'Browserless Primary', enabled: true, tier: 1, url: 'https://bl.example.com', token: '' },
	{ type: 'flaresolverr', id: 'fs-1', name: 'Flaresolverr', enabled: true, tier: 1, url: 'https://fs.example.com' },
	{
		type: 'scrapfly',
		id: 'sf-1',
		name: 'ScrapFly Fallback',
		enabled: true,
		tier: 2,
		apiKey: 'xxx',
		asp: true,
		renderJs: false,
	},
	{ type: 'ai', id: 'ai-rescue', name: 'AI Rescue', enabled: true, tier: 3 },
]

const providerRows: Array<ScrapeProviderStat> = [
	{ scraperId: 'fetch-provider', total: 4200, okCount: 4100, failCount: 100, avgMs: 320, p95Ms: 980 },
	{ scraperId: 'browserless:bl-primary', total: 820, okCount: 770, failCount: 50, avgMs: 1450, p95Ms: 3200 },
	{ scraperId: 'flaresolverr:fs-1', total: 210, okCount: 180, failCount: 30, avgMs: 2100, p95Ms: 4800 },
	{ scraperId: 'scrapfly:sf-1', total: 95, okCount: 70, failCount: 25, avgMs: 3400, p95Ms: 7200 },
	{ scraperId: 'ai:ai-rescue', total: 18, okCount: 14, failCount: 4, avgMs: 5200, p95Ms: 9100 },
	{ scraperId: 'merged:browserless:bl-primary,flaresolverr:fs-1', total: 60, okCount: 58, failCount: 2, avgMs: 1700, p95Ms: 3400 },
	// Orphaned historical row that should disappear in the view (no longer configured).
	{ scraperId: 'browserless:retired', total: 33, okCount: 10, failCount: 23, avgMs: 1900, p95Ms: 5000 },
]

function failure(url: string, scraperId: string, errorCode: string | null, hours: number): ScrapeFailureRow {
	return { url, scraperId, errorCode, ms: 1500 + hours * 100, createdAt: new Date(generatedAt.getTime() - hours * 3600 * 1000) }
}

const failures: Array<ScrapeFailureRow> = [
	// amazon: many timeouts across a few unique URLs
	failure('https://www.amazon.com/dp/B0001', 'browserless:bl-primary', 'timeout', 1),
	failure('https://www.amazon.com/dp/B0001', 'browserless:bl-primary', 'timeout', 2),
	failure('https://www.amazon.com/dp/B0002', 'flaresolverr:fs-1', 'timeout', 3),
	failure('https://www.amazon.com/dp/B0003', 'browserless:bl-primary', 'http-403', 4),
	failure('https://www.amazon.com/dp/B0004', 'browserless:bl-primary', 'http-503', 5),
	failure('https://smile.amazon.com/dp/B0005', 'scrapfly:sf-1', 'timeout', 6),
	// etsy
	failure('https://www.etsy.com/listing/100', 'browserless:bl-primary', 'http-403', 1),
	failure('https://www.etsy.com/listing/101', 'browserless:bl-primary', 'http-403', 2),
	failure('https://www.etsy.com/listing/102', 'scrapfly:sf-1', 'cloudflare-challenge', 3),
	// target
	failure('https://www.target.com/p/abc', 'fetch-provider', 'http-503', 1),
	failure('https://www.target.com/p/def', 'fetch-provider', 'http-503', 2),
	// best buy
	failure('https://www.bestbuy.com/site/x', 'ai:ai-rescue', 'extractor-empty', 7),
	// noise from a retired provider — should be filtered out before rolling up
	failure('https://www.legacy-domain.example/x', 'browserless:retired', 'timeout', 1),
	failure('https://www.legacy-domain.example/y', 'browserless:retired', 'timeout', 2),
]

const stats: ScrapeStats = {
	windowHours: 168,
	generatedAt,
	totals: providerRows.reduce(
		(acc, r) => {
			acc.total += r.total
			acc.ok += r.okCount
			acc.fail += r.failCount
			return acc
		},
		{ total: 0, ok: 0, fail: 0 }
	),
	providers: providerRows,
	failures,
	failuresTruncated: false,
}

const meta = {
	title: 'Admin/Scrape Stats',
	component: ScrapeStatsView,
	parameters: { layout: 'padded' },
	args: {
		onWindowChange: () => undefined,
		isLoading: false,
		windowHours: 168 as const,
	},
	argTypes: {
		onWindowChange: { action: 'window-changed' },
	},
} satisfies Meta<typeof ScrapeStatsView>

export default meta
type Story = StoryObj<typeof meta>

export const HealthyWithFailures: Story = {
	args: {
		stats,
		scrapeProviders: providers,
	},
	parameters: {
		docs: {
			description: {
				story:
					'Healthy chain across three tiers. The retired `browserless:retired` row and its failures are filtered out so the rollups only reflect the currently-configured providers. Click the list icon on a domain row to copy example failing URLs.',
			},
		},
	},
}

export const Loading: Story = {
	args: {
		stats: null,
		isLoading: true,
		scrapeProviders: providers,
	},
}

export const EmptyWindow: Story = {
	args: {
		stats: { ...stats, providers: [], failures: [], totals: { total: 0, ok: 0, fail: 0 } },
		scrapeProviders: providers,
	},
	parameters: {
		docs: { description: { story: 'No scrape attempts in the selected window.' } },
	},
}

export const FailuresTruncated: Story = {
	args: {
		stats: { ...stats, failuresTruncated: true },
		scrapeProviders: providers,
	},
	parameters: {
		docs: {
			description: {
				story: 'Failure feed hit the 5,000-row cap. Banner warns the admin that domain/error rollups under-count.',
			},
		},
	},
}

export const OnlyHistoricalScrapers: Story = {
	args: {
		stats: {
			...stats,
			providers: [{ scraperId: 'browserless:retired', total: 33, okCount: 10, failCount: 23, avgMs: 1900, p95Ms: 5000 }],
			failures: [failure('https://www.legacy-domain.example/x', 'browserless:retired', 'timeout', 1)],
		},
		scrapeProviders: providers,
	},
	parameters: {
		docs: {
			description: {
				story: 'Every scrape in the window came from a since-removed provider. The current-only view shows the empty-state copy.',
			},
		},
	},
}
