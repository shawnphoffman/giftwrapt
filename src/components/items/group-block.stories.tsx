import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'

import type { GroupSummary } from '@/api/lists'

import { withGalleryFrame } from './_stories/decorators'
import { makeItemForEditing, placeholderImages } from './_stories/fixtures'
import { GroupBlock } from './group-block'

/**
 * Renders a single group on the list edit page. Header shows priority, name,
 * type, and owner actions; the body holds grouped ItemEditRows with an OR or
 * arrow connector between them (pick-one vs ordered).
 */

const pickOneGroup: GroupSummary = { id: 10, type: 'or', name: 'Headphones', priority: 'high', sortOrder: null }
const orderGroup: GroupSummary = { id: 11, type: 'order', name: 'Coffee setup', priority: 'very-high', sortOrder: null }

const meta = {
	title: 'Items/Grouped Items',
	component: GroupBlock,
	parameters: { layout: 'fullscreen' },
	args: {
		groups: [pickOneGroup, orderGroup],
		listId: 1,
		isOwner: true,
		onAddItem: () => {},
		onDelete: () => {},
		onMoveItem: () => {},
		onReorder: () => {},
	},
	decorators: [withGalleryFrame],
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
			makeItemForEditing({ groupId: 10, title: 'Sony WH-1000XM5', price: '399', imageUrl: placeholderImages.squareSmall }),
			makeItemForEditing({ groupId: 10, title: 'Bose QuietComfort Ultra', price: '429' }),
			makeItemForEditing({ groupId: 10, title: 'AirPods Max', price: '549', imageUrl: placeholderImages.square }),
		],
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		// All three items render inside the group block.
		await expect(canvas.getByText(/Sony WH-1000XM5/)).toBeInTheDocument()
		await expect(canvas.getByText(/Bose QuietComfort Ultra/)).toBeInTheDocument()
		await expect(canvas.getByText(/AirPods Max/)).toBeInTheDocument()
		// Group label is visible on the header.
		await expect(canvas.getByText(/Headphones/)).toBeInTheDocument()
	},
}

export const OrderedWithReorder: Story = {
	args: {
		group: orderGroup,
		items: [
			makeItemForEditing({ groupId: 11, title: 'Espresso machine', price: '699', groupSortOrder: 0, imageUrl: placeholderImages.square }),
			makeItemForEditing({ groupId: 11, title: 'Grinder', price: '249', groupSortOrder: 1 }),
			makeItemForEditing({ groupId: 11, title: 'Scale', price: '65', groupSortOrder: 2, imageUrl: placeholderImages.squareSmall }),
		],
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		// Order group renders all items in the configured order.
		const titles = ['Espresso machine', 'Grinder', 'Scale']
		for (const title of titles) {
			await expect(canvas.getByText(title)).toBeInTheDocument()
		}
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
		items: [
			makeItemForEditing({ groupId: 10, title: 'Option A', price: '50' }),
			makeItemForEditing({ groupId: 10, title: 'Option B', price: '55' }),
		],
	},
	parameters: {
		docs: { description: { story: 'Group with no explicit name: falls back to just the type badge.' } },
	},
}

export const GifterView: Story = {
	args: {
		group: pickOneGroup,
		items: [makeItemForEditing({ groupId: 10, title: 'Option A', price: '50' })],
		isOwner: false,
		onMoveItem: undefined,
	},
	parameters: {
		docs: {
			description: { story: 'Read-only view without owner actions (add, edit, delete, move, reorder).' },
		},
	},
}
