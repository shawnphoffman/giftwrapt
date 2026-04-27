import type { Meta, StoryObj } from '@storybook/react-vite'

import { AiScrapingSectionView } from './ai-scraping-section-view'

/**
 * Section under the admin AI page. One toggle for the AI clean-title
 * post-pass; gated on whether the AI provider above is configured. The
 * AI scraper itself moved to /admin/scraping as a typed entry.
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
		scrapeAiCleanTitlesEnabled: false,
		aiAvailable: false,
	},
	parameters: {
		docs: {
			description: {
				story:
					'No AI provider is configured upstream. Toggle renders disabled with a hint explaining how to enable it. This is the default state for a fresh deployment.',
			},
		},
	},
}

export const AiAvailableOff: Story = {
	args: {
		scrapeAiCleanTitlesEnabled: false,
		aiAvailable: true,
	},
	parameters: {
		docs: {
			description: {
				story: 'AI is configured but the clean-title post-pass is off. Flip the switch to activate.',
			},
		},
	},
}

export const CleanTitlesOn: Story = {
	args: {
		scrapeAiCleanTitlesEnabled: true,
		aiAvailable: true,
	},
}

export const Saving: Story = {
	args: {
		scrapeAiCleanTitlesEnabled: false,
		aiAvailable: true,
		disabled: true,
	},
	parameters: {
		docs: {
			description: {
				story: 'Mutation in flight - the toggle is temporarily disabled until the server confirms.',
			},
		},
	},
}
