import type { Meta, StoryObj } from '@storybook/react-vite'

import UserAvatarBadge from './user-avatar-badge'

const meta = {
	title: 'Common/UserAvatarBadge',
	component: UserAvatarBadge,
	parameters: {
		layout: 'padded',
	},
	args: {
		name: 'Jamie Friend',
	},
} satisfies Meta<typeof UserAvatarBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Initials: Story = {}

export const WithImage: Story = {
	args: {
		image: 'https://i.pravatar.cc/64?img=5',
	},
}

export const LongName: Story = {
	args: {
		name: 'Alexandra Montgomery-Whitfield',
	},
}
