import type { Meta, StoryObj } from '@storybook/react-vite'

import type { MyListRow as MyListRowType } from '@/api/lists'

import { MyListRow } from './my-list-row'

const baseList: MyListRowType = {
	id: 1,
	name: 'My Wish List',
	type: 'wishlist',
	isActive: true,
	isPrivate: false,
	isPrimary: false,
	description: null,
	giftIdeasTargetUserId: null,
	itemCount: 12,
}

const meta = {
	title: 'Lists/MyListRow',
	component: MyListRow,
	parameters: {
		layout: 'padded',
	},
	decorators: [
		Story => (
			<div className="max-w-xl border rounded-md bg-background">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof MyListRow>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { args: { list: baseList } }

export const Primary: Story = {
	args: { list: { ...baseList, isPrimary: true } },
}

export const Private: Story = {
	args: { list: { ...baseList, name: 'Private list', isPrivate: true } },
}

export const Archived: Story = {
	args: { list: { ...baseList, name: 'Old wish list', isActive: false, itemCount: 3 } },
}

export const GiftIdeas: Story = {
	args: {
		list: { ...baseList, name: 'Ideas for Alex', type: 'giftideas', giftIdeasTargetUserId: 'user-2' },
	},
}

export const EmptyList: Story = {
	args: { list: { ...baseList, name: 'Brand new', itemCount: 0 } },
}

export const WithOwner: Story = {
	args: {
		list: { ...baseList, name: 'Shared family list' },
		showOwner: { name: 'Sam Sibling', email: 'sam@example.com' },
	},
	parameters: {
		docs: {
			description: { story: 'Editor view: shows whose list it is when the current user is a co-editor.' },
		},
	},
}
