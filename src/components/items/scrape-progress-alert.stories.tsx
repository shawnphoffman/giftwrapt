import type { Meta, StoryObj } from '@storybook/react-vite'

import type { ScrapeUiState } from '@/lib/use-scrape-url'

import { ScrapeProgressAlert } from './scrape-progress-alert'

/**
 * Per-phase progress alert rendered next to the URL field while a scrape is
 * in flight. Receives a fully reduced ScrapeUiState; the parent owns the
 * underlying useScrapeUrl hook and any retry behaviour.
 */
const meta = {
	title: 'Items/Scrape Progress Alert',
	component: ScrapeProgressAlert,
	parameters: { layout: 'padded' },
} satisfies Meta<typeof ScrapeProgressAlert>

export default meta
type Story = StoryObj<typeof meta>

const url = 'https://www.example.test/products/widget-2-pack'

const baseProviders = [
	{ providerId: 'fetch-provider', status: 'pending' as const },
	{ providerId: 'browserless-provider', status: 'pending' as const },
	{ providerId: 'flaresolverr-provider', status: 'pending' as const },
]

export const ScrapingFresh: Story = {
	args: {
		url,
		state: {
			phase: 'scraping',
			providers: [
				{ providerId: 'fetch-provider', status: 'in_progress' },
				{ providerId: 'browserless-provider', status: 'pending' },
			],
			elapsedMs: 1240,
			totalTimeoutMs: 20_000,
		} satisfies ScrapeUiState,
		onCancel: () => undefined,
	},
}

export const ScrapingMixed: Story = {
	args: {
		url,
		state: {
			phase: 'scraping',
			providers: [
				{ providerId: 'fetch-provider', status: 'failed', errorCode: 'bot_block', ms: 320 },
				{ providerId: 'browserless-provider', status: 'in_progress' },
				{ providerId: 'flaresolverr-provider', status: 'pending' },
			],
			elapsedMs: 4870,
			totalTimeoutMs: 20_000,
		},
		onCancel: () => undefined,
	},
}

export const ScrapingLong: Story = {
	args: {
		url,
		state: {
			phase: 'scraping',
			providers: baseProviders,
			elapsedMs: 14_500,
			totalTimeoutMs: 20_000,
		},
		onCancel: () => undefined,
	},
}

export const Partial: Story = {
	args: {
		url,
		state: {
			phase: 'partial',
			providers: [
				{ providerId: 'fetch-provider', status: 'done', score: 5, ms: 423 },
				{ providerId: 'ai-provider', status: 'in_progress' },
			],
			elapsedMs: 1900,
			totalTimeoutMs: 20_000,
			result: {
				title: 'ACME Widget 2-pack',
				description: 'A pack of two widgets, ideal for any kit.',
				imageUrls: ['https://cdn.example.test/widget.jpg'],
				price: '29.99',
				currency: 'USD',
				finalUrl: url,
			},
			fromProvider: 'fetch-provider',
			cached: false,
		},
		onCancel: () => undefined,
	},
}

export const Done: Story = {
	args: {
		url,
		state: {
			phase: 'done',
			providers: [{ providerId: 'fetch-provider', status: 'done', score: 6, ms: 423 }],
			elapsedMs: 423,
			totalTimeoutMs: 20_000,
			result: {
				title: 'ACME Widget 2-pack',
				imageUrls: ['https://cdn.example.test/widget.jpg'],
				finalUrl: url,
			},
			fromProvider: 'fetch-provider',
			cached: false,
		},
	},
}

export const DoneCached: Story = {
	args: {
		url,
		state: {
			phase: 'done',
			providers: [],
			elapsedMs: 12,
			result: {
				title: 'ACME Widget 2-pack (cached)',
				imageUrls: ['https://cdn.example.test/widget.jpg'],
				finalUrl: url,
			},
			fromProvider: 'fetch-provider',
			cached: true,
		},
	},
}

export const FailedAllProviders: Story = {
	args: {
		url,
		state: {
			phase: 'failed',
			providers: [{ providerId: 'fetch-provider', status: 'failed', errorCode: 'bot_block', ms: 320 }],
			elapsedMs: 320,
			reason: 'all-providers-failed',
		},
		onRetry: () => undefined,
	},
}

export const FailedTimeout: Story = {
	args: {
		url,
		state: {
			phase: 'failed',
			providers: [
				{ providerId: 'fetch-provider', status: 'failed', errorCode: 'timeout', ms: 10_000 },
				{ providerId: 'browserless-provider', status: 'in_progress' },
			],
			elapsedMs: 20_000,
			totalTimeoutMs: 20_000,
			reason: 'timeout',
		},
		onRetry: () => undefined,
	},
}

export const Idle: Story = {
	args: {
		state: { phase: 'idle', providers: [], elapsedMs: 0 },
	},
	parameters: {
		docs: { description: { story: 'In the `idle` phase the component returns null. Nothing should render below this story.' } },
	},
}
