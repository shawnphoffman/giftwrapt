import type { Meta, StoryObj } from '@storybook/react-vite'

import CountBadge from './count-badge'

const meta = {
	title: 'Common/Badges/CountBadge',
	component: CountBadge,
	parameters: {
		layout: 'padded',
	},
} satisfies Meta<typeof CountBadge>

export default meta
type Story = StoryObj<typeof meta>

export const AllClaimed: Story = {
	args: { count: 8, remaining: 0 },
	parameters: {
		docs: { description: { story: 'All items claimed: shows 0/total with a muted/greyed out treatment.' } },
	},
}

export const SomeRemaining: Story = {
	args: { count: 12, remaining: 5 },
}

export const AllRemaining: Story = {
	args: { count: 4, remaining: 4 },
}

export const Empty: Story = {
	args: { count: 0, remaining: 0 },
	parameters: {
		docs: { description: { story: 'Renders nothing when the total count is 0.' } },
	},
}
