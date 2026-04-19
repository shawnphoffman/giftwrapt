import type { Meta, StoryObj } from '@storybook/react-vite'

import LoadingSkeleton from './loading-skeleton'

const meta = {
	title: 'Skeletons/LoadingSkeleton',
	component: LoadingSkeleton,
	parameters: {
		layout: 'padded',
	},
	tags: [],
} satisfies Meta<typeof LoadingSkeleton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
