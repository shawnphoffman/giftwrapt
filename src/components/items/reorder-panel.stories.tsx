import type { Meta, StoryObj } from '@storybook/react-vite'

import type { GroupSummary } from '@/api/lists'
import type { Item } from '@/db/schema/items'

import { ReorderPanel } from './reorder-panel'

/**
 * The Reorder tab on the Organize page. Shows a vertical priority bucket per
 * priority value. Items and groups share the same DnD list inside each bucket;
 * group rows include a bullet preview of their child item titles.
 */

const now = new Date('2026-04-01T00:00:00Z')

function makeItem(overrides: Partial<Item> = {}): Item {
	return {
		id: 1,
		listId: 1,
		groupId: null,
		title: 'Item',
		status: 'incomplete',
		availability: 'available',
		availabilityChangedAt: null,
		url: null,
		vendorId: null,
		vendorSource: null,
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

const meta = {
	title: 'Items/Other/ReorderPanel',
	component: ReorderPanel,
	parameters: { layout: 'padded' },
	args: { listId: 1 },
	decorators: [
		Story => (
			<div className="max-w-2xl">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof ReorderPanel>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {
	args: {
		items: [],
		groups: [],
	},
}

export const ItemsOnly: Story = {
	args: {
		items: [
			makeItem({ id: 1, title: 'Climbing shoes', priority: 'low' }),
			makeItem({ id: 2, title: 'Noise-cancelling headphones', priority: 'high' }),
			makeItem({ id: 3, title: 'A really good cookbook', priority: 'normal' }),
			makeItem({ id: 4, title: 'Box of very nice chocolates', priority: 'normal' }),
		],
		groups: [],
	},
}

const pickOne: GroupSummary = { id: 10, type: 'or', name: 'Pick one', priority: 'normal', sortOrder: 0 }
const ordered: GroupSummary = { id: 11, type: 'order', name: 'Coffee setup', priority: 'very-high', sortOrder: 0 }
const emptyOrdered: GroupSummary = { id: 12, type: 'order', name: 'Empty group', priority: 'high', sortOrder: 1 }

export const ItemsAndGroups: Story = {
	args: {
		items: [
			makeItem({ id: 1, title: 'Noise-cancelling headphones', priority: 'high', sortOrder: 0 }),
			makeItem({ id: 2, title: 'A really good cookbook', priority: 'normal', sortOrder: 0 }),
			makeItem({ id: 3, title: 'Box of very nice chocolates', priority: 'normal', sortOrder: 1 }),
			makeItem({ id: 4, title: 'Climbing shoes', priority: 'low', sortOrder: 0 }),
			makeItem({ id: 100, groupId: 10, title: 'Nice dinner plates', priority: 'normal', groupSortOrder: 0 }),
			makeItem({ id: 101, groupId: 10, title: 'Matching bowls', priority: 'normal', groupSortOrder: 1 }),
			makeItem({ id: 200, groupId: 11, title: 'Espresso machine', priority: 'very-high', groupSortOrder: 0 }),
			makeItem({ id: 201, groupId: 11, title: 'Grinder', priority: 'very-high', groupSortOrder: 1 }),
		],
		groups: [pickOne, ordered, emptyOrdered],
	},
	parameters: {
		docs: {
			description: { story: 'Mixed items and groups across all priority buckets, including an empty group that shows "No items".' },
		},
	},
}

export const ArchivedHidden: Story = {
	args: {
		items: [
			makeItem({ id: 1, title: 'Visible', priority: 'high', sortOrder: 0 }),
			makeItem({ id: 2, title: 'Archived (hidden)', priority: 'high', isArchived: true }),
		],
		groups: [],
	},
	parameters: {
		docs: {
			description: { story: 'Archived items are filtered out of the Reorder panel.' },
		},
	},
}
