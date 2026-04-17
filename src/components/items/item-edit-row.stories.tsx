import type { Meta, StoryObj } from '@storybook/react-vite'

import type { GroupSummary } from '@/api/lists'
import type { Item } from '@/db/schema/items'

import { ItemEditRow } from './item-edit-row'

/**
 * Recipient's view of a list item — what the owner of a wish list sees when
 * they're managing their own list. The menu exposes edit / archive / delete /
 * group assignment. No claim state is visible because the owner doesn't see
 * who claimed what on their own list.
 */

const now = new Date('2026-04-01T00:00:00Z')

function makeItem(overrides: Partial<Item> = {}): Item {
	return {
		id: 1,
		listId: 1,
		groupId: null,
		title: 'Bluetooth headphones',
		status: 'incomplete',
		availability: 'available',
		url: 'https://www.amazon.com/dp/B0863TXGM3',
		imageUrl: null,
		price: '349.99',
		currency: 'USD',
		notes: null,
		priority: 'normal',
		isArchived: false,
		quantity: 1,
		groupSortOrder: null,
		createdAt: now,
		updatedAt: now,
		modifiedAt: null,
		...overrides,
	}
}

const groups: Array<GroupSummary> = [
	{ id: 10, type: 'or', name: null, priority: 'normal' },
	{ id: 11, type: 'order', name: null, priority: 'normal' },
]

const meta = {
	title: 'Items/ItemEditRow (recipient view)',
	component: ItemEditRow,
	parameters: {
		layout: 'padded',
	},
	decorators: [
		Story => (
			<div className="max-w-2xl border rounded-md bg-background">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof ItemEditRow>

export default meta
type Story = StoryObj<typeof meta>

export const Basic: Story = {
	args: {
		item: makeItem(),
	},
}

export const HighPriority: Story = {
	args: {
		item: makeItem({
			title: 'New couch for the living room',
			priority: 'very-high',
			price: '1299.00',
			url: null,
		}),
	},
}

export const WithQuantityAndNoUrl: Story = {
	args: {
		item: makeItem({
			title: 'Cozy wool socks',
			quantity: 4,
			price: '18',
			url: null,
			priority: 'low',
		}),
	},
}

export const InPickOneGroup: Story = {
	args: {
		item: makeItem({
			title: 'Nintendo Switch OLED',
			groupId: 10,
			price: '349.99',
		}),
		groups,
	},
}

export const InOrderGroup: Story = {
	args: {
		item: makeItem({
			title: 'Espresso machine',
			groupId: 11,
			price: '699',
		}),
		groups,
	},
}

export const LongTitle: Story = {
	args: {
		item: makeItem({
			title: 'A very very very very very very very very very very long product title that should truncate gracefully',
		}),
	},
}
