import type { Meta, StoryObj } from '@storybook/react-vite'

import type { User } from '@/db-collections/users'

import UserBadge from './user-badge'

const baseUser: User = {
	id: 'u1',
	email: 'alex@example.com',
	name: 'Alex Example',
	role: 'user',
	image: null,
	createdAt: '2026-01-01T00:00:00Z',
	updatedAt: '2026-01-01T00:00:00Z',
}

const meta = {
	title: 'Common/UserBadge',
	component: UserBadge,
	parameters: {
		layout: 'padded',
	},
} satisfies Meta<typeof UserBadge>

export default meta
type Story = StoryObj<typeof meta>

export const AllRoles: Story = {
	args: { user: baseUser },
	render: () => (
		<div className="flex gap-3 items-center">
			<UserBadge user={{ ...baseUser, role: 'user' }} />
			<UserBadge user={{ ...baseUser, role: 'admin' }} />
			<UserBadge user={{ ...baseUser, role: 'child' }} />
		</div>
	),
}
