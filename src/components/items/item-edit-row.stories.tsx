import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import type { GroupSummary } from '@/api/lists'

import { withItemFrame } from './_stories/decorators'
import { makeItem, placeholderImages } from './_stories/fixtures'
import { ItemEditRow } from './item-edit-row'

/**
 * Recipient's view of a list item, what the owner of a wish list sees when
 * they're managing their own list. The menu exposes edit / archive / delete /
 * group assignment. No claim state is visible because the owner doesn't see
 * who claimed what on their own list.
 */

const groups: Array<GroupSummary> = [
	{ id: 10, type: 'or', name: null, priority: 'normal', sortOrder: null },
	{ id: 11, type: 'order', name: null, priority: 'normal', sortOrder: null },
]

const meta = {
	title: 'Items/Item as Recipient',
	component: ItemEditRow,
	parameters: { layout: 'fullscreen' },
	decorators: [withItemFrame],
} satisfies Meta<typeof ItemEditRow>

export default meta
type Story = StoryObj<typeof meta>

export const Basic: Story = {
	args: {
		item: makeItem(),
	},
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement)
		await expect(canvas.getByText(args.item.title)).toBeInTheDocument()
	},
}

export const MenuOpens: Story = {
	args: {
		item: makeItem({ title: 'Open the action menu' }),
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		// Dropdown trigger is the button with aria-haspopup="menu".
		const menuTrigger = canvas.getAllByRole('button').find(b => b.getAttribute('aria-haspopup') === 'menu')
		await expect(menuTrigger).toBeDefined()
		await userEvent.click(menuTrigger!)
		// Verify the canonical owner actions in the menu so a regression
		// that drops one fails loudly. Items are: Edit, Mark unavailable,
		// Delete (plus Move/Group depending on props).
		const body = within(document.body)
		await expect(await body.findByRole('menuitem', { name: /edit/i })).toBeInTheDocument()
		await expect(await body.findByRole('menuitem', { name: /mark as unavailable/i })).toBeInTheDocument()
		await expect(await body.findByRole('menuitem', { name: /delete/i })).toBeInTheDocument()
	},
	tags: ['!autodocs'],
}

export const MenuClosesOnEscape: Story = {
	args: {
		item: makeItem({ title: 'Closable menu' }),
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const menuTrigger = canvas.getAllByRole('button').find(b => b.getAttribute('aria-haspopup') === 'menu')!
		await userEvent.click(menuTrigger)
		await within(document.body).findByRole('menuitem', { name: /edit/i })
		await userEvent.keyboard('{Escape}')
		// Radix's exit animation can keep the node mounted briefly. Wait
		// for it to disappear instead of asserting on a stale reference.
		await waitFor(() => {
			expect(within(document.body).queryByRole('menuitem', { name: /edit/i })).not.toBeInTheDocument()
		})
	},
	tags: ['!autodocs'],
}

export const WithImage: Story = {
	args: {
		item: makeItem({
			title: 'Hand-thrown ceramic mug',
			imageUrl: placeholderImages.square,
			price: '42',
			priority: 'high',
		}),
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

/**
 * With markdown notes rendered beneath the title. Notes render as formatted
 * markdown so owners get link/emphasis previews in their own list.
 */
export const WithNotes: Story = {
	args: {
		item: makeItem({
			title: 'Cast-iron dutch oven',
			notes: 'Prefer **enameled**: sage or cream. Avoid red.\n\nSize 5-7qt works.',
			priority: 'high',
			price: '250',
		}),
	},
}

/**
 * Grouped variant used when the row sits inside a group container. Removes the
 * outer border/radius and uses a continuous row divider instead.
 */
export const Grouped: Story = {
	args: {
		item: makeItem({
			title: 'Item inside a group',
			price: '49',
		}),
		grouped: true,
	},
	parameters: {
		docs: {
			description: {
				story: 'Rendered by GroupBlock for each item inside a group.',
			},
		},
	},
}

/**
 * Reorder controls appear only inside an ordered group with multiple items.
 */
export const WithReorderControls: Story = {
	args: {
		item: makeItem({
			title: 'Second item in an ordered group',
			price: '49',
		}),
		grouped: true,
		onMoveUp: () => {},
		onMoveDown: () => {},
	},
}

export const Unavailable: Story = {
	args: {
		item: makeItem({
			title: 'Limited-edition vinyl pressing',
			url: 'https://www.example.com/listing/12345',
			price: '85',
			availability: 'unavailable',
			availabilityChangedAt: new Date('2026-04-12T15:30:00Z'),
		}),
	},
	parameters: {
		docs: {
			description: {
				story: 'Owner view of an item flagged as unavailable. The badge serves as a reminder that gifters cannot claim it.',
			},
		},
	},
}
