import type { Meta, StoryObj } from '@storybook/react-vite'

import { withPageContainer } from '../../../.storybook/decorators'
import { adminData, disabledByFeature } from './__fixtures__/data'
import { AdminIntelligencePageContent } from './admin-intelligence-page'

const meta = {
	title: 'Intelligence/AdminIntelligencePage',
	component: AdminIntelligencePageContent,
	parameters: { layout: 'fullscreen' },
	decorators: [withPageContainer],
} satisfies Meta<typeof AdminIntelligencePageContent>

export default meta
type Story = StoryObj<typeof meta>

export const Healthy: Story = { args: { data: adminData } }
export const FeatureDisabled: Story = { args: { data: disabledByFeature } }
export const NoProviderConfigured: Story = {
	args: {
		data: {
			...adminData,
			health: { ...adminData.health, provider: { source: 'none', provider: null, model: null } },
		},
	},
}
export const NoProviderAndDisabled: Story = {
	args: {
		data: {
			...disabledByFeature,
			health: { ...disabledByFeature.health, provider: { source: 'none', provider: null, model: null } },
		},
	},
}
export const EmptyRuns: Story = { args: { data: { ...adminData, runs: [] } } }
