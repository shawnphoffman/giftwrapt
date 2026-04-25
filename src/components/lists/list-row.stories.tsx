import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentProps } from 'react'

import type { MyListRow as MyListRowType } from '@/api/lists'
import { listTypeEnumValues } from '@/db/schema/enums'
import type { UserWithLists } from '@/db-collections/lists'

import { ListRow } from './list-row'

type GifterList = UserWithLists['lists'][number]
type ListRowProps = ComponentProps<typeof ListRow>

const recipientBase: MyListRowType = {
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

const gifterBase: GifterList = {
	id: 1,
	name: 'Their Wish List',
	type: 'wishlist',
	isActive: true,
	description: null,
	createdAt: '2026-01-01T00:00:00Z',
	updatedAt: '2026-01-01T00:00:00Z',
	itemsTotal: 10,
	itemsRemaining: 6,
}

const meta: Meta<ListRowProps> = {
	title: 'Lists/ListRow',
	component: ListRow,
	parameters: { layout: 'padded' },
	decorators: [
		Story => (
			<div className="max-w-xl border rounded-md bg-accent p-2">
				<Story />
			</div>
		),
	],
}

export default meta
type Story = StoryObj<ListRowProps>

export const RecipientDefault: Story = {
	args: { role: 'recipient', list: recipientBase },
}

export const RecipientPrimary: Story = {
	args: { role: 'recipient', list: { ...recipientBase, isPrimary: true } },
}

export const RecipientPrivate: Story = {
	args: { role: 'recipient', list: { ...recipientBase, name: 'Private list', isPrivate: true } },
}

export const RecipientArchived: Story = {
	args: { role: 'recipient', list: { ...recipientBase, name: 'Old wish list', isActive: false, itemCount: 3 } },
}

export const RecipientGiftIdeas: Story = {
	args: {
		role: 'recipient',
		list: { ...recipientBase, name: 'Ideas for Alex', type: 'giftideas', giftIdeasTargetUserId: 'user-2' },
	},
}

export const RecipientEmpty: Story = {
	args: { role: 'recipient', list: { ...recipientBase, name: 'Brand new', itemCount: 0 } },
}

export const RecipientWithOwner: Story = {
	args: {
		role: 'recipient',
		list: { ...recipientBase, name: 'Shared family list' },
		showOwner: { name: 'Sam Sibling', email: 'sam@example.com' },
	},
	parameters: {
		docs: { description: { story: 'Editor view: shows whose list it is when the current user is a co-editor.' } },
	},
}

export const GifterDefault: Story = {
	args: { role: 'gifter', list: gifterBase },
}

export const GifterAllClaimed: Story = {
	args: { role: 'gifter', list: { ...gifterBase, name: 'Fully claimed list', itemsTotal: 4, itemsRemaining: 0 } },
}

export const GifterEmpty: Story = {
	args: { role: 'gifter', list: { ...gifterBase, name: 'Brand new list', itemsTotal: 0, itemsRemaining: 0 } },
}

export const GifterAllTypes: Story = {
	args: { role: 'gifter', list: gifterBase },
	render: () => (
		<div className="flex flex-col gap-1">
			{listTypeEnumValues.map((type, i) => (
				<ListRow
					key={type}
					role="gifter"
					list={{ ...gifterBase, id: i + 1, type, name: `${type} list`, itemsTotal: 8 + i, itemsRemaining: 3 + i }}
				/>
			))}
		</div>
	),
}

export const RoleFlip: Story = {
	args: { role: 'recipient', list: recipientBase },
	argTypes: {
		role: { control: 'radio', options: ['recipient', 'gifter'] },
	},
	render: ({ role }: ListRowProps) => {
		if (role === 'gifter') return <ListRow role="gifter" list={gifterBase} />
		return <ListRow role="recipient" list={recipientBase} />
	},
	parameters: {
		docs: {
			description: {
				story: 'Use the **role** control to flip between recipient (owner view with actions) and gifter (viewer with claim progress).',
			},
		},
	},
}
