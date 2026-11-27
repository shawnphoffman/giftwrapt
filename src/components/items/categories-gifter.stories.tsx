import type { Decorator, Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'

import type { GroupSummary } from '@/api/lists'
import type { CategoryKey, CategorySummary } from '@/lib/item-categories'

import { makeGift, makeItemWithGifts } from './_stories/fixtures'
import { CategoryOverview } from './category-overview'
import { ItemListView } from './item-list'

/**
 * Categories as a gifter sees them (plan 42, slice 42b). The list lands on
 * Priority, which is today's list. Arrange by Category groups it and shows
 * how claimed each category is. Beside the list, where the page is wide
 * enough, the overview panel shows the same counts and narrows the list.
 * Rows never carry a category label here.
 */

// Stands in for the page: `.wish-page` is the `page` container the panel's
// rem container query reads, widened as the route does for such a list.
const withPage =
	(maxWidth: string): Decorator =>
	Story => (
		<div className="flex min-h-full w-full justify-center p-4">
			<div className={`@container/page w-full ${maxWidth}`}>
				<Story />
			</div>
		</div>
	)

const categories: Array<CategorySummary> = [
	{ id: 1, name: 'Clothes', sortOrder: 0 },
	{ id: 2, name: 'Makeup & hair', sortOrder: 1 },
	{ id: 3, name: 'Kids: toys', sortOrder: 2 },
	{ id: 4, name: 'Kids: clothes', sortOrder: 3 },
]

const bikeGroup: GroupSummary = { id: 10, type: 'or', name: 'Balance bike', priority: 'high', sortOrder: null, categoryId: 3 }

const items = [
	makeItemWithGifts({ title: 'Aritzia Super Puff jacket', price: '250', priority: 'very-high', categoryId: 1 }),
	makeItemWithGifts({ title: 'Ugg Tasman slippers', price: '110', priority: 'high', categoryId: 1, gifts: [makeGift()] }),
	makeItemWithGifts({ title: 'Dyson Airwrap', price: '599', priority: 'very-high', categoryId: 2 }),
	makeItemWithGifts({ title: 'Laneige lip sleeping mask', price: '24', categoryId: 2, gifts: [makeGift()] }),
	makeItemWithGifts({ title: 'Magna-Tiles 100 piece set', price: '120', priority: 'high', categoryId: 3, gifts: [makeGift()] }),
	makeItemWithGifts({ title: 'Yoto Mini player', price: '70', categoryId: 3, gifts: [makeGift()] }),
	makeItemWithGifts({ title: 'Strider 12 Sport', price: '110', groupId: 10, groupSortOrder: 0 }),
	makeItemWithGifts({ title: 'Woom 1', price: '249', groupId: 10, groupSortOrder: 1 }),
	makeItemWithGifts({ title: 'Hanna Andersson pajamas', price: '46', quantity: 2, categoryId: 4 }),
	makeItemWithGifts({ title: 'Something from the farmers market', priority: 'low', categoryId: null }),
]

const meta = {
	title: 'Items/Categories (Gifter)',
	parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** A wide page: the overview panel sits beside the list. */
export const WidePage: Story = {
	decorators: [withPage('max-w-[66rem]')],
	render: () => <ItemListView items={items} groups={[bikeGroup]} categories={categories} />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		// Lands on Priority: no sections, and rows carry no category label.
		await expect(canvas.getByRole('radio', { name: 'Priority' })).toHaveAttribute('data-state', 'on')
		await expect(canvas.getByRole('complementary', { name: /what's on this list/i })).toBeInTheDocument()
		// Nothing in Kids: clothes is claimed yet, and the panel says so.
		await expect(canvas.getByText(/nothing claimed yet in kids: clothes/i)).toBeInTheDocument()

		await userEvent.click(canvas.getByRole('radio', { name: 'Category' }))
		// A Pick One group counts once: Kids: toys is 2 items plus the group.
		const toys = canvas.getAllByText('2 of 3 claimed')
		await expect(toys.length).toBeGreaterThan(0)
	},
}

/** A narrow page (a phone, or a small window): no panel; the section headers carry the counts. */
export const NarrowPage: Story = {
	decorators: [withPage('max-w-3xl')],
	render: () => <ItemListView items={items} groups={[bikeGroup]} categories={categories} />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await userEvent.click(canvas.getByRole('radio', { name: 'Category' }))
		await expect(canvas.getByRole('heading', { name: 'Kids: clothes' })).toBeInTheDocument()
	},
}

/** A list with no categories the viewer can see: no Arrange by control and no panel. */
export const WithoutCategories: Story = {
	decorators: [withPage('max-w-[66rem]')],
	render: () => <ItemListView items={items.map(i => ({ ...i, categoryId: null }))} groups={[{ ...bikeGroup, categoryId: null }]} />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await expect(canvas.queryByRole('radio', { name: 'Category' })).not.toBeInTheDocument()
		await expect(canvas.queryByRole('complementary')).not.toBeInTheDocument()
	},
}

function OverviewDemo() {
	const [selected, setSelected] = useState<CategoryKey | null>(null)
	return (
		<div className="w-68">
			<CategoryOverview
				selected={selected}
				onSelect={setSelected}
				rows={[
					{ key: 1, name: 'Clothes', total: 4, claimed: 1 },
					{ key: 2, name: 'Makeup & hair', total: 4, claimed: 1 },
					{ key: 3, name: 'Kids: toys', total: 4, claimed: 3 },
					{ key: 4, name: 'Kids: clothes', total: 2, claimed: 0 },
					{ key: 'none', name: 'No category', total: 2, claimed: 0 },
				]}
			/>
		</div>
	)
}

/** The panel on its own. Pressing a row narrows the list; pressing it again shows everything. */
export const OverviewPanel: Story = {
	decorators: [withPage('max-w-3xl')],
	render: () => <OverviewDemo />,
}
