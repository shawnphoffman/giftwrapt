import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { AiFeaturesCardView } from './ai-features-card'

/**
 * The feature list on /admin/ai. Every row and its "What is sent"
 * disclosure comes from the registry in `src/lib/ai-features.ts`.
 */
const meta = {
	title: 'Admin/AiFeaturesCard',
	component: AiFeaturesCardView,
	parameters: { layout: 'padded' },
	args: {
		settings: { scrapeAiCleanTitlesEnabled: false, aiPhotoExtractEnabled: true, intelligenceEnabled: false },
		aiAvailable: true,
		pending: false,
		onToggle: fn(),
		searchUrl: { value: null, pending: false, onSave: fn() },
	},
} satisfies Meta<typeof AiFeaturesCardView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const NoProvider: Story = {
	args: { aiAvailable: false },
	parameters: { docs: { description: { story: 'Switches are disabled until an AI provider is configured.' } } },
}

/** Gift Suggestions with a search link set: every idea gets a Search link to that page. */
export const WithSearchLink: Story = {
	args: { searchUrl: { value: 'https://www.google.com/search?q={query}', pending: false, onSave: fn() } },
}
