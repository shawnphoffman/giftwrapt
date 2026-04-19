import type { Meta, StoryObj } from '@storybook/react-vite'

import UserAvatar from './user-avatar'

const meta = {
	title: 'Common/UserAvatar',
	component: UserAvatar,
	parameters: {
		layout: 'padded',
	},
	args: {
		name: 'Jamie Friend',
	},
} satisfies Meta<typeof UserAvatar>

export default meta
type Story = StoryObj<typeof meta>

export const AllSizes: Story = {
	render: args => (
		<div className="flex items-end gap-4">
			<UserAvatar {...args} size="small" />
			<UserAvatar {...args} size="medium" />
			<UserAvatar {...args} size="large" />
			<UserAvatar {...args} size="huge" />
		</div>
	),
}

export const WithImage: Story = {
	args: {
		size: 'large',
		image: 'https://i.pravatar.cc/128?img=12',
	},
}
