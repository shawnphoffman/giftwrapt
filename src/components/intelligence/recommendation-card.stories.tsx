import type { Meta, StoryObj } from '@storybook/react-vite'

import { withPageContainer } from '../../../.storybook/decorators'
import { populatedData } from './__fixtures__/data'
import { RecommendationCard } from './recommendation-card'

const meta = {
	title: 'Intelligence/RecommendationCard',
	component: RecommendationCard,
	parameters: { layout: 'fullscreen' },
	decorators: [withPageContainer],
} satisfies Meta<typeof RecommendationCard>

export default meta
type Story = StoryObj<typeof meta>

const recsById = Object.fromEntries(populatedData.recs.map(r => [r.id, r]))

export const PrimaryListMissing: Story = { args: { rec: recsById['rec-1'] } }
export const StaleItemsBatch: Story = { args: { rec: recsById['rec-2'] } }
export const StaleSingleDependent: Story = { args: { rec: recsById['rec-3'] } }
export const DuplicatesAcrossLists: Story = { args: { rec: recsById['rec-4'] } }
export const GroupingMergeSafe: Story = { args: { rec: recsById['rec-5'] } }
export const GroupingTypeCrossingDestructive: Story = { args: { rec: recsById['rec-6'] } }
export const GroupingDependentList: Story = { args: { rec: recsById['rec-7'] } }
export const RelationLabelsPathNav: Story = { args: { rec: recsById['rec-8'] } }

export const SeverityInfo: Story = { args: { rec: { ...recsById['rec-3'], severity: 'info' } } }
export const SeveritySuggest: Story = { args: { rec: { ...recsById['rec-2'], severity: 'suggest' } } }
export const SeverityImportant: Story = { args: { rec: { ...recsById['rec-1'], severity: 'important' } } }

export const Dismissed: Story = { args: { rec: { ...recsById['rec-2'], status: 'dismissed', dismissedAt: new Date() } } }
export const Applied: Story = { args: { rec: { ...recsById['rec-1'], status: 'applied' } } }

export const Busy: Story = { args: { rec: recsById['rec-2'], pending: true } }
