// import { fn } from 'storybook/test'

import ListsByUserSkeleton from './lists-by-user-skeleton'
import type { Meta, StoryObj } from '@storybook/react-vite'

const meta = {
	title: 'Skeletons/ListsByUserSkeleton',
	component: ListsByUserSkeleton,
	parameters: {
		layout: 'centered',
	},
	tags: [],
} satisfies Meta<typeof ListsByUserSkeleton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
