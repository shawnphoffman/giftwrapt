import type { Meta, StoryObj } from '@storybook/react-vite'

import { listTypeEnumValues } from '@/db/schema/enums'
import type { UserWithLists } from '@/db-collections/lists'

import ListsForUserRow from './lists-for-user-row'

type ListRow = UserWithLists['lists'][number]

const baseList: ListRow = {
	id: 1,
	name: 'My Wish List',
	type: 'wishlist',
	isActive: true,
	description: null,
	createdAt: '2026-01-01T00:00:00Z',
	updatedAt: '2026-01-01T00:00:00Z',
	itemsTotal: 10,
	itemsRemaining: 6,
}

const meta = {
	title: 'Lists/ListsForUserRow',
	component: ListsForUserRow,
	parameters: {
		layout: 'padded',
	},
	decorators: [
		Story => (
			<div className="max-w-md border rounded-md bg-accent p-2">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof ListsForUserRow>

export default meta
type Story = StoryObj<typeof meta>

export const AllTypes: Story = {
	args: { list: baseList },
	render: () => (
		<div className="flex flex-col gap-1">
			{listTypeEnumValues.map((type, i) => (
				<ListsForUserRow
					key={type}
					list={{ ...baseList, id: i + 1, type, name: `${type} list`, itemsTotal: 8 + i, itemsRemaining: 3 + i }}
				/>
			))}
		</div>
	),
}

export const AllClaimed: Story = {
	args: {
		list: { ...baseList, name: 'Fully claimed list', itemsTotal: 4, itemsRemaining: 0 },
	},
}

export const Empty: Story = {
	args: {
		list: { ...baseList, name: 'Brand new list', itemsTotal: 0, itemsRemaining: 0 },
	},
}
