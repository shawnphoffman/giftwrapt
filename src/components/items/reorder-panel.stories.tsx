import type { Meta, StoryObj } from '@storybook/react-vite'
import { userEvent, within } from 'storybook/test'

import type { GroupSummary } from '@/api/lists'
import type { Item } from '@/db/schema/items'

import { ReorderPanel } from './reorder-panel'

/**
 * The Reorder tab on the Organize page. Shows a vertical priority bucket per
 * priority value. Items and groups share the same DnD list inside each bucket;
 * group rows include a bullet preview of their child item titles.
 *
 * The Multi-select toggle above the buckets enables tap-to-select on rows;
 * dragging a selected row carries the whole selection across buckets.
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
		ratingValue: null,
		ratingCount: null,
		priority: 'normal',
		isArchived: false,
		pendingDeletionAt: null,
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

const PRIORITY_CYCLE: Array<Item['priority']> = ['very-high', 'high', 'normal', 'low']

const MANY_TITLES = [
	'Espresso machine',
	'Burr grinder',
	'Cast iron skillet',
	'Sourdough banneton',
	'Linen apron',
	'Chef’s knife',
	'Honing rod',
	'Cutting board',
	'Stand mixer',
	'Rolling pin',
	'Wool socks',
	'Rain jacket',
	'Hiking poles',
	'Headlamp',
	'Dry bag',
	'Insulated bottle',
	'Camp chair',
	'Trail running shoes',
	'Climbing chalk',
	'Belay device',
	'Sleeping bag liner',
	'Inflatable pillow',
	'Pocket knife',
	'Travel notebook',
	'Fountain pen',
	'Ink cartridges',
	'Reading lamp',
	'Bookmark set',
	'Sci-fi novel',
	'Coffee table book',
	'Vinyl record',
	'Bluetooth speaker',
	'USB-C hub',
	'Mechanical keyboard',
	'Mouse pad',
	'Desk plant',
	'Watering can',
	'Houseplant fertilizer',
	'Linen pillowcases',
	'Wool throw blanket',
]

function makeManyItems(): Array<Item> {
	return MANY_TITLES.map((title, idx) =>
		makeItem({
			id: idx + 1,
			title,
			priority: PRIORITY_CYCLE[idx % PRIORITY_CYCLE.length],
			sortOrder: Math.floor(idx / PRIORITY_CYCLE.length),
		})
	)
}

export const ManyItems: Story = {
	args: {
		items: makeManyItems(),
		groups: [],
	},
	parameters: {
		docs: {
			description: {
				story:
					'40 items spread across all four priority buckets. Use this to verify dragging rows across buckets, scrolling the page on mobile (touch the row body, not the grip), and that long-press on the grip starts a drag.',
			},
		},
	},
}

export const ManyItemsAndGroups: Story = {
	args: {
		items: [
			...makeManyItems(),
			makeItem({ id: 200, groupId: 10, title: 'Nice dinner plates', priority: 'normal', groupSortOrder: 0 }),
			makeItem({ id: 201, groupId: 10, title: 'Matching bowls', priority: 'normal', groupSortOrder: 1 }),
			makeItem({ id: 202, groupId: 10, title: 'Linen napkins', priority: 'normal', groupSortOrder: 2 }),
			makeItem({ id: 210, groupId: 11, title: 'Espresso machine', priority: 'very-high', groupSortOrder: 0 }),
			makeItem({ id: 211, groupId: 11, title: 'Grinder', priority: 'very-high', groupSortOrder: 1 }),
			makeItem({ id: 212, groupId: 11, title: 'Tamper', priority: 'very-high', groupSortOrder: 2 }),
		],
		groups: [pickOne, ordered, emptyOrdered],
	},
	parameters: {
		docs: {
			description: {
				story:
					'Many items plus three groups across the buckets. Use to verify dragging both items AND group rows across priority buckets, and to verify the bucket reorders correctly when you drop next to a group.',
			},
		},
	},
}

function makeLabeledItems(perBucket = 10): Array<Item> {
	const out: Array<Item> = []
	let id = 1
	for (const priority of PRIORITY_CYCLE) {
		for (let i = 1; i <= perBucket; i++) {
			out.push(
				makeItem({
					id: id++,
					priority,
					sortOrder: i - 1,
					title: `${priority} - ${i} item`,
				})
			)
		}
	}
	return out
}

export const MultiSelectActive: Story = {
	args: {
		items: makeLabeledItems(),
		groups: [],
	},
	parameters: {
		docs: {
			description: {
				story:
					'Multi-select toggle pre-flipped on, with three rows pre-selected via a play function. Item titles are formatted "{priority} - {index} item" so you can see where rows originated after dragging the selection across buckets. Use this to verify the toggle UI, the selected-row fill, the "N selected" indicator, and that dragging a selected row carries the whole selection (the floating overlay should read "N rows selected" instead of the row title).',
			},
		},
	},
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const canvas = within(canvasElement)
		const multi = canvas.getByRole('radio', { name: /^multi$/i })
		await userEvent.click(multi)
		await userEvent.click(canvas.getByText('very-high - 1 item'))
		await userEvent.click(canvas.getByText('high - 1 item'))
		await userEvent.click(canvas.getByText('normal - 1 item'))
	},
}

export const Empty: Story = {
	args: {
		items: [],
		groups: [],
	},
}
