import type { Meta, StoryObj } from '@storybook/react-vite'

import type { ScrapeProviderEntry } from '@/lib/settings'

import { ScraperProvidersFormView } from './scraper-providers-form-view'

/**
 * Admin form for tuning the scraping pipeline. Per-provider/overall
 * timeouts, cache TTL, quality threshold, and a 0:N drag-reorderable list
 * of typed scrape provider entries (browserless, flaresolverr,
 * browserbase-fetch, browserbase-stagehand, custom-http). Each entry has
 * its own card and saves explicitly.
 */
const meta = {
	title: 'Admin/Scraper Providers Form',
	component: ScraperProvidersFormView,
	parameters: { layout: 'padded' },
	args: {
		onChange: () => undefined,
	},
	argTypes: {
		onChange: { action: 'changed' },
	},
} satisfies Meta<typeof ScraperProvidersFormView>

export default meta
type Story = StoryObj<typeof meta>

type DefaultSettings = {
	scrapeProviderTimeoutMs: number
	scrapeOverallTimeoutMs: number
	scrapeQualityThreshold: number
	scrapeCacheTtlHours: number
	scrapeProviders: Array<ScrapeProviderEntry>
}

const defaultSettings: DefaultSettings = {
	scrapeProviderTimeoutMs: 10_000,
	scrapeOverallTimeoutMs: 20_000,
	scrapeQualityThreshold: 3,
	scrapeCacheTtlHours: 24,
	scrapeProviders: [],
}

export const Defaults: Story = {
	args: {
		settings: { ...defaultSettings },
	},
	parameters: {
		docs: { description: { story: 'Fresh deployment - all defaults, no scrapers configured yet.' } },
	},
}

export const TightBudgets: Story = {
	args: {
		settings: {
			scrapeProviderTimeoutMs: 4_000,
			scrapeOverallTimeoutMs: 12_000,
			scrapeQualityThreshold: 5,
			scrapeCacheTtlHours: 6,
			scrapeProviders: [],
		},
	},
	parameters: {
		docs: { description: { story: 'Operator wants snappy scrapes and a high bar before stopping.' } },
	},
}

export const CachingDisabled: Story = {
	args: {
		settings: { ...defaultSettings, scrapeCacheTtlHours: 0 },
	},
	parameters: {
		docs: { description: { story: 'Cache TTL set to 0 disables URL-based deduping. Every paste of the same URL re-scrapes.' } },
	},
}

export const SingleCustomHttp: Story = {
	args: {
		settings: {
			...defaultSettings,
			scrapeProviders: [
				{
					type: 'custom-http',
					id: 'amzn',
					name: 'My Amazon scraper',
					enabled: true,
					tier: 1,
					endpoint: 'https://my-scraper.local/scrape',
					responseKind: 'html',
				},
			],
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					'Single custom HTTP scraper enabled, returning raw HTML. Card layout with type chip, drag handle, name field, switch, delete button, and type-specific config below.',
			},
		},
	},
}

export const MixedTypes: Story = {
	args: {
		settings: {
			...defaultSettings,
			scrapeProviders: [
				{
					type: 'browserless',
					id: 'bl-self',
					name: 'Self-hosted Browserless',
					enabled: true,
					tier: 1,
					url: 'https://browserless.local',
					token: undefined,
				},
				{
					type: 'browserbase-fetch',
					id: 'bb-fetch',
					name: 'Browserbase (fast)',
					enabled: true,
					tier: 2,
					apiKey: '',
					proxies: true,
					allowRedirects: true,
				},
				{
					type: 'browserbase-stagehand',
					id: 'bb-stage',
					name: 'Browserbase (Stagehand)',
					enabled: false,
					tier: 3,
					apiKey: '',
					projectId: '',
				},
				{
					type: 'custom-http',
					id: 'amzn',
					name: 'Amazon JSON',
					enabled: true,
					tier: 1,
					endpoint: 'https://amazon-scraper.local/scrape',
					responseKind: 'json',
					customHeaders: ['X-Scrape-Token: secret-value', 'Authorization: Bearer abc123'].join('\n'),
				},
			],
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					'Mixed-type chain: a sequential Browserless, a sequential Browserbase Fetch, a (disabled) parallel Stagehand, and a Custom HTTP scraper. Drag handles let the admin reorder.',
			},
		},
	},
}

export const NewlyAddedEntry: Story = {
	args: {
		settings: {
			...defaultSettings,
			scrapeProviders: [
				{
					type: 'custom-http',
					id: 'fresh',
					name: 'Scraper 1',
					enabled: false,
					tier: 1,
					endpoint: '',
					responseKind: 'html',
				},
			],
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"A scraper entry was just added but the endpoint hasn't been typed yet. New entries default to enabled:false so a half-configured scraper doesn't run; isAvailable() also excludes it from the chain until a valid URL/key is filled in.",
			},
		},
	},
}

export const Saving: Story = {
	args: {
		settings: { ...defaultSettings },
		disabled: true,
	},
	parameters: { docs: { description: { story: 'Mutation in flight - all controls temporarily disabled until the server confirms.' } } },
}

export const NearLimits: Story = {
	args: {
		settings: {
			...defaultSettings,
			scrapeProviders: [
				{
					type: 'browserbase-stagehand',
					id: 'bb-stage-near',
					// 56 chars - flips the name counter into the amber band before the cap (60).
					name: 'Browserbase Stagehand for stubborn product pages aaaaa',
					enabled: true,
					tier: 2,
					apiKey: '',
					projectId: 'bb_proj_demo',
					instruction:
						'Extract the product title, current price, currency, main image URLs, the site display name, and any visible secondary images. ' +
						'Return them in the canonical ScrapeResult shape so the orchestrator can score this against the cheaper providers. '.repeat(8),
				},
				{
					type: 'custom-http',
					id: 'custom-near',
					// Pushes the name to exactly the cap so the counter renders right at 60/60.
					name: 'Custom HTTP scraper aimed at niche regional retailers!!',
					enabled: true,
					tier: 3,
					endpoint: 'https://niche-scraper.example.com/scrape',
					responseKind: 'html',
					// Long-ish header blob to demo the headers counter when it's well past 90% of HEADERS_JSON.
					customHeaders: Array.from({ length: 80 }, (_, i) => `X-Header-${i}: ${'value-segment-'.repeat(3)}`).join('\n'),
				},
			],
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					'Two entries with content near the SHORT_NAME / MEDIUM_TEXT / HEADERS_JSON caps. Useful for eyeballing the amber and destructive states of the new character counters without any keystrokes.',
			},
		},
	},
}
