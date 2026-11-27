import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'

import type { GroupSummary } from '@/api/lists'
import { appSettingsQueryOptions } from '@/hooks/use-app-settings'
import type { CategoryKey, CategorySummary } from '@/lib/item-categories'
import { DEFAULT_APP_SETTINGS } from '@/lib/settings'

import { withGalleryFrame } from './_stories/decorators'
import { makeItem, makeItemForEditing } from './_stories/fixtures'
import { ArrangeByToggle, type Arrangement } from './arrange-by-toggle'
import { CategoriesDialog } from './categories-dialog'
import { CategoryFilterChips } from './category-filter-chips'
import { GroupBlock } from './group-block'
import { ItemEditRow } from './item-edit-row'
import { ItemFormDialog } from './item-form-dialog'
import { ListCategoriesProvider } from './list-categories-context'

/**
 * Optional categories on a list (plan 42). The owner labels items, filters by
 * category, and manages the categories in a dialog. Nothing here shows claims:
 * every count is an item count.
 */

const LIST_ID = 1

const categories: Array<CategorySummary> = [
	{ id: 1, name: 'Clothes', sortOrder: 0 },
	{ id: 2, name: 'Makeup & hair', sortOrder: 1 },
	{ id: 3, name: 'Kids: toys', sortOrder: 2 },
	{ id: 4, name: 'Kids: clothes', sortOrder: 3 },
	{ id: 5, name: 'For the two of us', sortOrder: 4 },
]

const counts = new Map<CategoryKey, number>([
	[1, 4],
	[2, 4],
	[3, 4],
	[4, 2],
	[5, 2],
	['none', 2],
])

const itemCounts = new Map<number, number>([
	[1, 4],
	[2, 4],
	[3, 4],
	[4, 2],
	[5, 2],
])

function WithCategories({ children, list = categories }: { children: ReactNode; list?: Array<CategorySummary> }) {
	return <ListCategoriesProvider value={{ listId: LIST_ID, categories: list, onManage: () => {} }}>{children}</ListCategoriesProvider>
}

const meta = {
	title: 'Items/Categories',
	parameters: { layout: 'fullscreen' },
	decorators: [withGalleryFrame],
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** The dialog on a list that has categories: rename, reorder, delete, add. */
export const Dialog: Story = {
	render: () => <CategoriesDialog open onOpenChange={() => {}} listId={LIST_ID} categories={categories} itemCounts={itemCounts} />,
	play: async () => {
		const body = within(document.body)
		await expect(await body.findByDisplayValue('Clothes')).toBeInTheDocument()
		// Names from the person's other lists are offered to add with a tap.
		await expect(await body.findByRole('button', { name: 'Books' })).toBeInTheDocument()
		// The admin switch is off by default, so there is no Suggest button.
		await expect(body.queryByRole('button', { name: /suggest categories/i })).not.toBeInTheDocument()
	},
}

// App settings with the admin's Category Suggestions switch on. The story
// frame's settings are the defaults, where every AI feature is off.
function WithSuggestionsOn({ children }: { children: ReactNode }) {
	const [client] = useState(() => {
		const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
		qc.setQueryData(appSettingsQueryOptions.queryKey, { ...DEFAULT_APP_SETTINGS, aiCategorySuggestionsEnabled: true })
		return qc
	})
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

/**
 * With the admin's Category Suggestions switch on, the dialog offers Suggest
 * Categories. It shows what it would create and how many items go in each,
 * and nothing changes until Use These.
 */
export const DialogSuggest: Story = {
	render: () => (
		<WithSuggestionsOn>
			<CategoriesDialog open onOpenChange={() => {}} listId={LIST_ID} categories={categories.slice(0, 1)} itemCounts={itemCounts} />
		</WithSuggestionsOn>
	),
	play: async () => {
		const body = within(document.body)
		await userEvent.click(await body.findByRole('button', { name: /suggest categories/i }))
		await expect(await body.findByText('Kids: toys')).toBeInTheDocument()
		await expect(body.getByRole('button', { name: 'Use These' })).toBeInTheDocument()
		// Two of the proposed categories are new; the existing one is not marked.
		await expect(body.getAllByText('New')).toHaveLength(2)
	},
}

/** The dialog on a list with no categories yet. */
export const DialogEmpty: Story = {
	render: () => <CategoriesDialog open onOpenChange={() => {}} listId={LIST_ID} categories={[]} itemCounts={new Map()} />,
	play: async () => {
		const body = within(document.body)
		await expect(await body.findByText(/no categories yet/i)).toBeInTheDocument()
	},
}

/** A row's label is also its picker. An item with no category shows a dashed "Add category". */
export const RowLabels: Story = {
	render: () => (
		<WithCategories>
			<div className="flex flex-col gap-2 xs:pl-6">
				<ItemEditRow item={makeItem({ listId: LIST_ID, title: 'Aritzia Super Puff jacket', price: '250', categoryId: 1 })} />
				<ItemEditRow item={makeItem({ listId: LIST_ID, title: 'Dyson Airwrap', price: '599', priority: 'very-high', categoryId: 2 })} />
				<ItemEditRow item={makeItem({ listId: LIST_ID, title: 'Something from the farmers market', categoryId: null })} />
				<ItemEditRow
					item={makeItem({
						listId: LIST_ID,
						title: 'Personalized family name sign for the front porch (the 24 inch one, not the 18 inch)',
						price: '64',
						quantity: 3,
						categoryId: 5,
					})}
				/>
			</div>
		</WithCategories>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await expect(canvas.getByText('Clothes')).toBeInTheDocument()
		await expect(canvas.getByText(/add category/i)).toBeInTheDocument()
	},
}

/** With no categories on the list, rows carry no label at all. */
export const RowWithoutCategories: Story = {
	render: () => (
		<div className="flex flex-col gap-2 xs:pl-6">
			<ItemEditRow item={makeItem({ listId: LIST_ID, title: 'Aritzia Super Puff jacket', price: '250' })} />
		</div>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await expect(canvas.queryByText(/add category/i)).not.toBeInTheDocument()
	},
}

const bikeGroup: GroupSummary = { id: 10, type: 'or', name: 'Balance bike', priority: 'high', sortOrder: null, categoryId: 3 }

/** A group has one category for all of its members, set in the group's footer. */
export const GroupFooter: Story = {
	render: () => (
		<WithCategories>
			<div className="xs:pl-6">
				<GroupBlock
					group={bikeGroup}
					groups={[bikeGroup]}
					listId={LIST_ID}
					items={[
						makeItemForEditing({ listId: LIST_ID, groupId: 10, title: 'Strider 12 Sport', price: '110' }),
						makeItemForEditing({ listId: LIST_ID, groupId: 10, title: 'Woom 1', price: '249' }),
					]}
					onAddItem={() => {}}
					onDelete={() => {}}
					onReorder={() => {}}
				/>
			</div>
		</WithCategories>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await expect(canvas.getByText(/category for the whole group/i)).toBeInTheDocument()
		await expect(canvas.getByText('Kids: toys')).toBeInTheDocument()
	},
}

function FilterChipsDemo() {
	const [selected, setSelected] = useState<ReadonlySet<CategoryKey>>(new Set())
	return (
		<CategoryFilterChips
			categories={categories}
			counts={counts}
			total={18}
			selected={selected}
			onToggle={key => {
				const next = new Set(selected)
				if (next.has(key)) next.delete(key)
				else next.add(key)
				setSelected(next)
			}}
			onClear={() => setSelected(new Set())}
		/>
	)
}

/** The filter row above the owner's list. It scrolls sideways on a phone. */
export const FilterChips: Story = {
	render: () => <FilterChipsDemo />,
}

function ArrangeByDemo() {
	const [value, setValue] = useState<Arrangement>('priority')
	return <ArrangeByToggle value={value} onChange={setValue} />
}

/** Words from the xs breakpoint up, icons only below it. */
export const ArrangeBy: Story = {
	render: () => <ArrangeByDemo />,
}

/** Adding an item on a list that has categories: the form has a Category field. */
export const ItemFormAdd: Story = {
	render: () => (
		<WithCategories>
			<ItemFormDialog open onOpenChange={() => {}} mode="create" listId={LIST_ID} />
		</WithCategories>
	),
	play: async () => {
		const body = within(document.body)
		await expect(await body.findByText('Category')).toBeInTheDocument()
	},
}

/** Editing an item that already has a category. */
export const ItemFormEdit: Story = {
	render: () => (
		<WithCategories>
			<ItemFormDialog
				open
				onOpenChange={() => {}}
				mode="edit"
				item={makeItem({
					listId: LIST_ID,
					title: 'Aritzia Super Puff jacket',
					price: '250',
					notes: 'Size S, the matte black one.',
					categoryId: 1,
				})}
			/>
		</WithCategories>
	),
	play: async () => {
		const body = within(document.body)
		// The field opens on the item's current category.
		await expect(await body.findByRole('combobox', { name: 'Category' })).toHaveTextContent('Clothes')
	},
}

/** With no categories on the list, the form is unchanged. */
export const ItemFormWithoutCategories: Story = {
	render: () => <ItemFormDialog open onOpenChange={() => {}} mode="create" listId={LIST_ID} />,
	play: async () => {
		const body = within(document.body)
		await expect(await body.findByText('Title')).toBeInTheDocument()
		await expect(body.queryByText('Category')).not.toBeInTheDocument()
	},
}
