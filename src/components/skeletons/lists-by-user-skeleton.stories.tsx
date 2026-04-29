import type { Meta, StoryObj } from '@storybook/react-vite'

import type { UserWithLists } from '@/db-collections/lists'

import ListsForUser from '../lists/lists-for-user'
import ListsByUserSkeleton from './lists-by-user-skeleton'

const sampleUser: UserWithLists = {
	id: 'user-1',
	email: 'jamie@example.com',
	name: 'Jamie Friend',
	role: 'user',
	image: null,
	birthMonth: 'may',
	birthDay: 12,
	partnerId: null,
	lists: [
		{
			id: 1,
			name: 'Wish List',
			type: 'wishlist',
			isActive: true,
			description: null,
			createdAt: '2026-01-01T00:00:00Z',
			updatedAt: '2026-01-01T00:00:00Z',
			itemsTotal: 10,
			itemsRemaining: 6,
		},
	],
}

const meta = {
	title: 'Utilities/Skeletons/ListsByUserSkeleton',
	component: ListsByUserSkeleton,
	parameters: {
		layout: 'padded',
	},
	tags: [],
} satisfies Meta<typeof ListsByUserSkeleton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
	render: () => (
		<div className="flex flex-col gap-4 max-w-lg">
			<ListsByUserSkeleton />
			<ListsForUser user={sampleUser} />
		</div>
	),
}
