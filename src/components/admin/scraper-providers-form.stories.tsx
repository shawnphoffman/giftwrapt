import type { Meta, StoryObj } from '@storybook/react-vite'

import { ScraperProvidersFormView } from './scraper-providers-form-view'

/**
 * Admin form for tuning the scraping pipeline. Per-provider/overall
 * timeouts, cache TTL, quality threshold, and the optional custom-HTTP
 * provider config. Saves on blur / Enter.
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

const defaultSettings = {
	scrapeProviderTimeoutMs: 10_000,
	scrapeOverallTimeoutMs: 20_000,
	scrapeQualityThreshold: 3,
	scrapeCacheTtlHours: 24,
	scrapeCustomHttpProvider: undefined,
} as const

export const Defaults: Story = {
	args: {
		settings: { ...defaultSettings },
	},
	parameters: {
		docs: { description: { story: 'Fresh deployment - all defaults, custom HTTP off.' } },
	},
}

export const TightBudgets: Story = {
	args: {
		settings: {
			scrapeProviderTimeoutMs: 4_000,
			scrapeOverallTimeoutMs: 12_000,
			scrapeQualityThreshold: 5,
			scrapeCacheTtlHours: 6,
			scrapeCustomHttpProvider: undefined,
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

export const CustomHttpHtmlMode: Story = {
	args: {
		settings: {
			...defaultSettings,
			scrapeCustomHttpProvider: {
				enabled: true,
				endpoint: 'https://my-scraper.local/scrape',
				responseKind: 'html',
			},
		},
	},
	parameters: {
		docs: {
			description: {
				story: 'Custom HTTP scraper enabled, returning raw HTML. The orchestrator runs the response through the local extractor.',
			},
		},
	},
}

export const CustomHttpJsonWithAuth: Story = {
	args: {
		settings: {
			...defaultSettings,
			scrapeCustomHttpProvider: {
				enabled: true,
				endpoint: 'https://my-scraper.local/scrape',
				responseKind: 'json',
				customHeaders: ['X-Scrape-Token: secret-value', 'Authorization: Bearer abc123'].join('\n'),
			},
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					'Custom HTTP scraper returning structured JSON in the documented ScrapeResult shape, with custom headers attached to every request. The local extractor is bypassed for this provider.',
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
