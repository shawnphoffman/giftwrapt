// import { fn } from 'storybook/test'

import type { Meta, StoryObj } from '@storybook/react-vite'

import ListsByUserSkeleton from './lists-by-user-skeleton'

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
