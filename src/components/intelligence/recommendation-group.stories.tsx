import type { Meta, StoryObj } from '@storybook/react-vite'

import { withPageContainer } from '../../../.storybook/decorators'
import { populatedData } from './__fixtures__/data'
import { groupKeyForAnalyzer, RecommendationGroup } from './recommendation-group'

const meta = {
	title: 'Intelligence/RecommendationGroup',
	component: RecommendationGroup,
	parameters: { layout: 'fullscreen' },
	decorators: [withPageContainer],
} satisfies Meta<typeof RecommendationGroup>

export default meta
type Story = StoryObj<typeof meta>

const all = populatedData.recs

export const Setup: Story = {
	args: { groupKey: 'setup', recs: all.filter(r => groupKeyForAnalyzer(r.analyzerId) === 'setup') },
}
export const Cleanup: Story = {
	args: { groupKey: 'cleanup', recs: all.filter(r => groupKeyForAnalyzer(r.analyzerId) === 'cleanup') },
}
export const Organize: Story = {
	args: { groupKey: 'organize', recs: all.filter(r => groupKeyForAnalyzer(r.analyzerId) === 'organize') },
}
