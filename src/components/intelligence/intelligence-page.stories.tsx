import type { Meta, StoryObj } from '@storybook/react-vite'

import { withPageContainer } from '../../../.storybook/decorators'
import {
	allDismissedData,
	cooldownData,
	emptyData,
	errorData,
	generatingData,
	partialProgressData,
	populatedData,
} from './__fixtures__/data'
import { IntelligencePageContent } from './intelligence-page'

const meta = {
	title: 'Intelligence/IntelligencePage',
	component: IntelligencePageContent,
	parameters: { layout: 'fullscreen' },
	decorators: [withPageContainer],
} satisfies Meta<typeof IntelligencePageContent>

export default meta
type Story = StoryObj<typeof meta>

export const Populated: Story = { args: { state: { kind: 'loaded', data: populatedData } } }
// The page renders a list-filter popover next to the Refresh button.
// Open it from this story to see "Your lists" plus the "Global suggestions"
// pseudo-row pulled from the relation-labels rec in populatedData.
export const PopulatedWithListFilter: Story = {
	args: { state: { kind: 'loaded', data: populatedData } },
	parameters: {
		docs: {
			description: {
				story:
					'Click the Filter button in the header. Uncheck a list to mute its recs; uncheck Global to mute the "Tell us who you shop for" reminder. Reset by reloading - the selection is session-only.',
			},
		},
	},
}
export const PartialProgress: Story = { args: { state: { kind: 'loaded', data: partialProgressData } } }
export const Cooldown: Story = { args: { state: { kind: 'loaded', data: cooldownData } } }
export const Empty: Story = { args: { state: { kind: 'loaded', data: emptyData } } }
export const AllDismissed: Story = { args: { state: { kind: 'loaded', data: allDismissedData } } }
export const Generating: Story = { args: { state: { kind: 'generating', data: generatingData } } }
export const Errored: Story = { args: { state: { kind: 'error', data: errorData, message: 'Provider returned 503 (rate limited)' } } }
export const DisabledByFeature: Story = { args: { state: { kind: 'disabled', reason: 'feature-disabled' } } }
export const DisabledNoProvider: Story = { args: { state: { kind: 'disabled', reason: 'no-provider' } } }
