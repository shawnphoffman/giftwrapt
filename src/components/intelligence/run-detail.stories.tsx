import type { Meta, StoryObj } from '@storybook/react-vite'

import { withPageContainer } from '../../../.storybook/decorators'
import { runDetailData } from './__fixtures__/data'
import { RunDetailContent } from './run-detail'

const meta = {
	title: 'Intelligence/RunDetail',
	component: RunDetailContent,
	parameters: { layout: 'fullscreen' },
	decorators: [withPageContainer],
} satisfies Meta<typeof RunDetailContent>

export default meta
type Story = StoryObj<typeof meta>

export const Success: Story = { args: { data: runDetailData } }

export const ErrorRun: Story = {
	args: {
		data: {
			...runDetailData,
			run: { ...runDetailData.run, status: 'error', error: 'Provider returned 503 (rate limited)' },
			steps: [
				...runDetailData.steps.slice(0, 1),
				{
					...runDetailData.steps[1],
					error: 'AbortError: model call timed out after 30s',
					responseRaw: null,
					parsed: null,
				},
			],
		},
	},
}
