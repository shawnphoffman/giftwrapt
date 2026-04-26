import type { Meta, StoryObj } from '@storybook/react-vite'

import { AiScrapingSectionView } from './ai-scraping-section-view'

/**
 * Section under the admin AI page. Two toggles, both gated on whether the
 * AI provider above is configured. Both default off; flipping them on
 * activates the orchestrator's parallel AI scrape provider and the
 * clean-title post-pass respectively.
 */
const meta = {
	title: 'Admin/AI Scraping Section',
	component: AiScrapingSectionView,
	parameters: { layout: 'padded' },
	args: {
		onChange: () => undefined,
	},
	argTypes: {
		onChange: { action: 'changed' },
	},
} satisfies Meta<typeof AiScrapingSectionView>

export default meta
type Story = StoryObj<typeof meta>

export const NoAiProviderConfigured: Story = {
	args: {
		scrapeAiProviderEnabled: false,
		scrapeAiCleanTitlesEnabled: false,
		aiAvailable: false,
	},
	parameters: {
		docs: {
			description: {
				story:
					'No AI provider is configured upstream. Both toggles render disabled with a hint explaining how to enable them. This is the default state for a fresh deployment.',
			},
		},
	},
}

export const AiAvailableBothOff: Story = {
	args: {
		scrapeAiProviderEnabled: false,
		scrapeAiCleanTitlesEnabled: false,
		aiAvailable: true,
	},
	parameters: {
		docs: {
			description: {
				story:
					'AI is configured but neither feature has been turned on yet. Toggles are interactive; flipping them activates the corresponding orchestrator hook.',
			},
		},
	},
}

export const AiScrapeOnly: Story = {
	args: {
		scrapeAiProviderEnabled: true,
		scrapeAiCleanTitlesEnabled: false,
		aiAvailable: true,
	},
}

export const CleanTitlesOnly: Story = {
	args: {
		scrapeAiProviderEnabled: false,
		scrapeAiCleanTitlesEnabled: true,
		aiAvailable: true,
	},
}

export const BothOn: Story = {
	args: {
		scrapeAiProviderEnabled: true,
		scrapeAiCleanTitlesEnabled: true,
		aiAvailable: true,
	},
}

export const Saving: Story = {
	args: {
		scrapeAiProviderEnabled: true,
		scrapeAiCleanTitlesEnabled: false,
		aiAvailable: true,
		disabled: true,
	},
	parameters: {
		docs: {
			description: {
				story: 'Mutation in flight - both toggles are temporarily disabled until the server confirms.',
			},
		},
	},
}
