import type { Meta, StoryObj } from '@storybook/react-vite'

import type { AddonOnList } from '@/api/lists'

import { ListAddonRow } from './list-addon-row'

const NOW = new Date('2026-04-01T00:00:00Z')

const viewerUser = {
	id: 'viewer-1',
	name: 'Alex Buyer',
	email: 'alex@example.com',
	image: null,
}

const otherGifter = {
	id: 'friend-2',
	name: 'Jamie Friend',
	email: 'jamie@example.com',
	image: null,
}

function makeAddon(overrides: Partial<AddonOnList> = {}): AddonOnList {
	return {
		id: 1,
		listId: 1,
		userId: otherGifter.id,
		description: 'A surprise off-list gift',
		totalCost: null,
		notes: null,
		url: null,
		imageUrl: null,
		createdAt: NOW,
		user: otherGifter,
		...overrides,
	}
}

const meta = {
	title: 'List Addons/Addon Row',
	component: ListAddonRow,
	parameters: {
		layout: 'fullscreen',
		session: { user: viewerUser },
	},
	decorators: [
		Story => (
			<div className="min-h-full w-full flex justify-center p-4">
				<div className="w-full max-w-2xl border border-dashed border-muted-foreground/40 rounded-lg py-4 px-8 bg-background/50">
					<Story />
				</div>
			</div>
		),
	],
} satisfies Meta<typeof ListAddonRow>

export default meta
type Story = StoryObj<typeof meta>

export const FromOtherGifter: Story = {
	args: {
		addon: makeAddon(),
		listId: 1,
	},
}

export const Mine: Story = {
	args: {
		addon: makeAddon({ userId: viewerUser.id, user: viewerUser, totalCost: '24.99', notes: 'Wrapped in kraft paper.' }),
		listId: 1,
	},
}

export const DateAddedRecent: Story = {
	args: {
		addon: makeAddon({
			description: 'Added a few days ago',
			createdAt: new Date('2026-03-28T00:00:00Z'),
		}),
		listId: 1,
	},
	parameters: {
		docs: { description: { story: 'Subtle date-added indicator sits to the left of the overflow menu, matching items.' } },
	},
}

export const DateAddedLastYear: Story = {
	args: {
		addon: makeAddon({
			description: 'Added in a previous year',
			createdAt: new Date('2025-11-04T00:00:00Z'),
		}),
		listId: 1,
	},
	parameters: {
		docs: { description: { story: 'Dates outside the current year include the year so they read unambiguously.' } },
	},
}

export const WithUrl: Story = {
	args: {
		addon: makeAddon({
			description: 'Olive wood salad servers',
			url: 'https://www.etsy.com/listing/1566789/olive-wood-salad-servers',
		}),
		listId: 1,
	},
}

export const WithImage: Story = {
	args: {
		addon: makeAddon({ description: 'Salmon treats', imageUrl: 'https://placehold.co/200x200/png?text=Square' }),
		listId: 1,
	},
}

export const WithUrlImageAndNotes: Story = {
	args: {
		addon: makeAddon({
			userId: viewerUser.id,
			user: viewerUser,
			description: 'Framed watercolor of the lake house dock at sunset',
			totalCost: '85.00',
			notes: 'Commissioned from the photo Dad took last summer. **Ships the 12th.**',
			url: 'https://www.etsy.com/listing/1567234901/custom-watercolor-house-portrait',
			imageUrl: 'https://placehold.co/320x120/png?text=Wide',
		}),
		listId: 1,
	},
}

export const LongDescriptionAndUrl: Story = {
	args: {
		addon: makeAddon({
			description: 'A very very very very long off-list gift description that has to truncate before it pushes the badges off the row',
			url: 'https://www.some-extremely-long-retailer-domain-name.example.com/products/category/subcategory/item?variant=12345&utm_source=newsletter',
			imageUrl: 'https://placehold.co/140x280/png?text=Tall',
		}),
		listId: 1,
	},
	parameters: {
		docs: { description: { story: 'Long text truncates; the URL collapses to its domain badge.' } },
	},
}

export const BrokenImage: Story = {
	args: {
		addon: makeAddon({ description: 'Image that fails to load', imageUrl: 'https://example.invalid/missing.png' }),
		listId: 1,
	},
}
