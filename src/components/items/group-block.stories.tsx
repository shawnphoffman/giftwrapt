import type { Meta, StoryObj } from '@storybook/react-vite'

import type { GroupSummary } from '@/api/lists'
import type { Item } from '@/db/schema/items'

import { GroupBlock } from './group-block'

/**
 * Renders a single group on the list edit page. Header shows priority, name,
 * type, and owner actions; the body holds flush ItemEditRows with an OR or
 * arrow connector between them (pick-one vs ordered).
 */

const now = new Date('2026-04-01T00:00:00Z')

function makeItem(overrides: Partial<Item> = {}): Item {
	return {
		id: 1,
		listId: 1,
		groupId: 10,
		title: 'Item',
		status: 'incomplete',
		availability: 'available',
		url: null,
		imageUrl: null,
		price: null,
		currency: 'USD',
		notes: null,
		priority: 'normal',
		isArchived: false,
		quantity: 1,
		groupSortOrder: null,
		sortOrder: null,
		createdAt: now,
		updatedAt: now,
		modifiedAt: null,
		...overrides,
	}
}

const pickOneGroup: GroupSummary = { id: 10, type: 'or', name: 'Headphones', priority: 'high', sortOrder: null }
const orderGroup: GroupSummary = { id: 11, type: 'order', name: 'Coffee setup', priority: 'very-high', sortOrder: null }

const meta = {
	title: 'Items/GroupBlock',
	component: GroupBlock,
	parameters: { layout: 'padded' },
	args: {
		groups: [pickOneGroup, orderGroup],
		isOwner: true,
		onAddItem: () => {},
		onDelete: () => {},
		onMoveItem: () => {},
		onReorder: () => {},
	},
	decorators: [
		Story => (
			<div className="max-w-2xl">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof GroupBlock>

export default meta
type Story = StoryObj<typeof meta>

export const PickOneEmpty: Story = {
	args: {
		group: pickOneGroup,
		items: [],
	},
}

export const PickOneWithItems: Story = {
	args: {
		group: pickOneGroup,
		items: [
			makeItem({ id: 1, title: 'Sony WH-1000XM5', price: '399' }),
			makeItem({ id: 2, title: 'Bose QuietComfort Ultra', price: '429' }),
			makeItem({ id: 3, title: 'AirPods Max', price: '549' }),
		],
	},
}

export const OrderedWithReorder: Story = {
	args: {
		group: orderGroup,
		items: [
			makeItem({ id: 1, groupId: 11, title: 'Espresso machine', price: '699', groupSortOrder: 0 }),
			makeItem({ id: 2, groupId: 11, title: 'Grinder', price: '249', groupSortOrder: 1 }),
			makeItem({ id: 3, groupId: 11, title: 'Scale', price: '65', groupSortOrder: 2 }),
		],
	},
}

export const OrderedEmpty: Story = {
	args: {
		group: orderGroup,
		items: [],
	},
}

export const UnnamedGroup: Story = {
	args: {
		group: { ...pickOneGroup, name: null },
		items: [makeItem({ id: 1, title: 'Option A', price: '50' }), makeItem({ id: 2, title: 'Option B', price: '55' })],
	},
	parameters: {
		docs: { description: { story: 'Group with no explicit name: falls back to just the type badge.' } },
	},
}

export const GifterView: Story = {
	args: {
		group: pickOneGroup,
		items: [makeItem({ id: 1, title: 'Option A', price: '50' })],
		isOwner: false,
		onMoveItem: undefined,
	},
	parameters: {
		docs: {
			description: { story: 'Read-only view without owner actions (add, edit, delete, move, reorder).' },
		},
	},
}
