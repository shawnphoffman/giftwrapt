import type { Meta, StoryObj } from '@storybook/react-vite'

import type { UserWithLists } from '@/db-collections/lists'

import ListsForUser from './lists-for-user'

const baseUser: UserWithLists = {
	id: 'user-1',
	email: 'jamie@example.com',
	name: 'Jamie Friend',
	image: null,
	birthMonth: 'may',
	birthDay: 12,
	partnerId: null,
	lastGiftedAt: null,
	lists: [
		{
			id: 1,
			name: 'Wish List',
			type: 'wishlist',
			description: null,
			createdAt: '2026-01-01T00:00:00Z',
			updatedAt: '2026-01-01T00:00:00Z',
			itemsTotal: 10,
			itemsRemaining: 6,
		},
		{
			id: 2,
			name: 'Christmas 2026',
			type: 'christmas',
			description: null,
			createdAt: '2026-01-01T00:00:00Z',
			updatedAt: '2026-01-01T00:00:00Z',
			itemsTotal: 18,
			itemsRemaining: 4,
		},
		{
			id: 3,
			name: 'Birthday',
			type: 'birthday',
			description: null,
			createdAt: '2026-01-01T00:00:00Z',
			updatedAt: '2026-01-01T00:00:00Z',
			itemsTotal: 5,
			itemsRemaining: 5,
		},
	],
}

const meta = {
	title: 'Lists/ListsForUser',
	component: ListsForUser,
	parameters: {
		layout: 'padded',
	},
	decorators: [
		Story => (
			<div className="max-w-lg">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof ListsForUser>

export default meta
type Story = StoryObj<typeof meta>

export const WithLists: Story = {
	args: { user: baseUser },
}

export const NoBirthday: Story = {
	args: {
		user: { ...baseUser, name: 'Sam Sibling', birthMonth: null, birthDay: null },
	},
}

export const WithAvatar: Story = {
	args: {
		user: { ...baseUser, image: 'https://i.pravatar.cc/128?img=22' },
	},
}

export const WithPartner: Story = {
	args: {
		user: {
			...baseUser,
			partnerId: 'user-2',
		},
	},
}

export const SingleList: Story = {
	args: {
		user: { ...baseUser, lists: [baseUser.lists[0]] },
	},
}

export const NoLists: Story = {
	args: {
		user: { ...baseUser, name: 'New User', lists: [] },
	},
}
