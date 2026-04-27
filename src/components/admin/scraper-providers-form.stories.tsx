import type { Meta, StoryObj } from '@storybook/react-vite'

import { ScraperProvidersFormView } from './scraper-providers-form-view'

/**
 * Admin form for tuning the scraping pipeline. Per-provider/overall
 * timeouts, cache TTL, quality threshold, and a 0:N list of custom-HTTP
 * scraper entries. Saves on blur / Enter.
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
	scrapeCustomHttpProviders: Array<{
		id: string
		name: string
		enabled: boolean
		endpoint: string
		responseKind: 'html' | 'json'
		customHeaders?: string
	}>
}

const defaultSettings: DefaultSettings = {
	scrapeProviderTimeoutMs: 10_000,
	scrapeOverallTimeoutMs: 20_000,
	scrapeQualityThreshold: 3,
	scrapeCacheTtlHours: 24,
	scrapeCustomHttpProviders: [],
}

export const Defaults: Story = {
	args: {
		settings: { ...defaultSettings },
	},
	parameters: {
		docs: { description: { story: 'Fresh deployment - all defaults, no custom scrapers configured yet.' } },
	},
}

export const TightBudgets: Story = {
	args: {
		settings: {
			scrapeProviderTimeoutMs: 4_000,
			scrapeOverallTimeoutMs: 12_000,
			scrapeQualityThreshold: 5,
			scrapeCacheTtlHours: 6,
			scrapeCustomHttpProviders: [],
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
			scrapeCustomHttpProviders: [
				{
					id: 'amzn',
					name: 'My Amazon scraper',
					enabled: true,
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
					'Single custom HTTP scraper enabled, returning raw HTML. Card layout with name, switch, delete button, and full config below.',
			},
		},
	},
}

export const MultipleCustomHttp: Story = {
	args: {
		settings: {
			...defaultSettings,
			scrapeCustomHttpProviders: [
				{
					id: 'amzn',
					name: 'Amazon (JSON)',
					enabled: true,
					endpoint: 'https://amazon-scraper.local/scrape',
					responseKind: 'json',
					customHeaders: ['X-Scrape-Token: secret-value', 'Authorization: Bearer abc123'].join('\n'),
				},
				{
					id: 'etsy',
					name: 'Etsy (HTML)',
					enabled: true,
					endpoint: 'https://etsy-scraper.local/scrape',
					responseKind: 'html',
				},
				{
					id: 'fallback',
					name: 'Generic fallback',
					enabled: false,
					endpoint: 'https://fallback.local/scrape',
					responseKind: 'html',
				},
			],
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					'Three configured scrapers (one with auth headers + JSON mode, one disabled). The orchestrator runs them in order after the built-in providers.',
			},
		},
	},
}

export const NewlyAddedEntry: Story = {
	args: {
		settings: {
			...defaultSettings,
			scrapeCustomHttpProviders: [
				{
					id: 'fresh',
					name: 'Scraper 1',
					enabled: true,
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
					"A scraper entry was just added but the endpoint hasn't been typed yet. The schema accepts empty endpoint at save time so the toggle round-trips; isAvailable() excludes it from the chain until a valid URL is filled in.",
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
