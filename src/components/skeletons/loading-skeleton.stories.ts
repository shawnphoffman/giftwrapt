import LoadingSkeleton from './loading-skeleton'
import type { Meta, StoryObj } from '@storybook/react-vite'

const meta = {
	title: 'Skeletons/LoadingSkeleton',
	component: LoadingSkeleton,
	parameters: {
		layout: 'centered',
	},
	tags: [],
} satisfies Meta<typeof LoadingSkeleton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
