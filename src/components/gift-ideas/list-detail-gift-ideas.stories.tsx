import type { Decorator, Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import type { GiftIdeasSource } from '@/api/gift-ideas'
import type { AddonOnList, ItemWithGifts } from '@/api/lists'
import DependentAvatar from '@/components/common/dependent-avatar'
import ListTypeTile from '@/components/common/list-type-tile'
import { MarkdownNotes } from '@/components/common/markdown-notes'
import UserAvatar from '@/components/common/user-avatar'
import {
	makeGift,
	makeItemWithGifts,
	NOW,
	otherGifter,
	placeholderImages,
	thirdGifter,
	viewerUser,
} from '@/components/items/_stories/fixtures'
import ItemList from '@/components/items/item-list'
import { ItemListSkeleton } from '@/components/items/item-list-skeleton'
import { ListAddonsSection } from '@/components/list-addons/list-addons-section'
import { ListAddonsSectionSkeleton } from '@/components/list-addons/list-addons-section-skeleton'
import { itemsKeys } from '@/lib/queries/items'
import { listDetailKeys } from '@/lib/queries/lists'

import { GiftIdeasOnList } from './gift-ideas-section'

/**
 * The gifter's view of a recipient's list with the Gift Ideas section between
 * the list items and Off-List Gifts. Ideas come from gift-ideas lists that
 * target the recipient and that the viewer owns or edits; claimed ideas are
 * already gone (the server copies them into an off-list gift and deletes
 * them). The header is copied from `ListDetailBody`; ItemList, GiftIdeasOnList
 * and ListAddonsSection are the real components fed from a seeded query cache.
 */

const LIST_ID = 42
const LIST_NAME = "Linda's Christmas 2026"

const listItems: Array<ItemWithGifts> = [
	makeItemWithGifts({
		id: 1,
		listId: LIST_ID,
		title: 'Le Creuset Dutch oven, 5.5 qt, Sea Salt',
		price: '420',
		priority: 'high',
		url: 'https://www.lecreuset.com/round-dutch-oven/21177.html',
		vendorId: 'lecreuset.com',
		gifts: [makeGift({ itemId: 1, gifterId: viewerUser.id, gifter: viewerUser })],
	}),
	makeItemWithGifts({
		id: 2,
		listId: LIST_ID,
		title: 'Kindle Paperwhite Signature Edition',
		price: '189.99',
		url: 'https://www.amazon.com/dp/B0CFPJYX7P',
	}),
	makeItemWithGifts({
		id: 3,
		listId: LIST_ID,
		title: 'Endless Summer hydrangea (the blue one, not the pink one!)',
		price: '45',
		url: null,
		vendorId: null,
		notes: 'For the side yard by the fence.',
	}),
]

const IDEAS_MINE = 201
const IDEAS_JAMIE = 202

function idea(overrides: Partial<ItemWithGifts>): ItemWithGifts {
	return makeItemWithGifts({ listId: IDEAS_MINE, url: null, vendorId: null, createdAt: NOW, ...overrides })
}

function addon(
	id: number,
	user: typeof viewerUser,
	description: string,
	totalCost: string | null,
	extra: Partial<AddonOnList> = {}
): AddonOnList {
	return {
		id,
		listId: LIST_ID,
		userId: user.id,
		description,
		totalCost,
		notes: null,
		url: null,
		imageUrl: null,
		createdAt: NOW,
		user,
		...extra,
	}
}

const watercolor = idea({
	id: 301,
	title: 'Framed watercolor of the lake house dock at sunset',
	price: '85',
	url: 'https://www.etsy.com/listing/1567234901/custom-watercolor-house-portrait-from-photo-personalized',
	vendorId: 'etsy',
	imageUrl: placeholderImages.wide,
})
const pottery = idea({
	id: 302,
	title: 'Pottery wheel class for two at Clay Studio on 4th',
	price: '$140',
	notes: 'She brought this up twice at Thanksgiving. **Saturday** sessions only, she works Sundays.',
	priority: 'high',
})
const cashmere = idea({ id: 303, title: 'Cashmere travel wrap, oatmeal', price: '120' })

const myIdeas: GiftIdeasSource = {
	list: { id: IDEAS_MINE, name: 'Ideas for Linda' },
	owner: viewerUser,
	viewerIsOwner: true,
	items: [pottery, watercolor, cashmere],
}

const jamiesIdeas: GiftIdeasSource = {
	list: { id: IDEAS_JAMIE, name: 'Linda stocking stuffers' },
	owner: otherGifter,
	viewerIsOwner: false,
	items: [idea({ id: 311, listId: IDEAS_JAMIE, title: 'Olive wood salad servers', price: '28' })],
}

// Jamie already claimed a Rummikub idea from this list: it's gone from Gift
// Ideas and lives here as Jamie's off-list gift.
const existingAddons: Array<AddonOnList> = [
	addon(1, thirdGifter, 'Gift card to Blue Heron Bistro', '75'),
	addon(2, otherGifter, 'Replacement Rummikub tiles (the 7s and both jokers are missing)', '19'),
]

function seeded(sources: Array<GiftIdeasSource>, addons: Array<AddonOnList> = existingAddons): Decorator {
	return Story => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
		// The real query options use staleTime 0, which would refetch on mount
		// from the stubbed API (empty). Pin the seeded data instead.
		const pinned = { refetchOnMount: false, refetchOnWindowFocus: false, refetchOnReconnect: false } as const
		client.setQueryDefaults(itemsKeys.byList(LIST_ID), pinned)
		client.setQueryDefaults(listDetailKeys.byList(LIST_ID), pinned)
		client.setQueryData(itemsKeys.view(LIST_ID, 'priority-desc'), listItems)
		client.setQueryData(listDetailKeys.addons(LIST_ID), addons)
		client.setQueryData(listDetailKeys.giftIdeas(LIST_ID), sources)
		return (
			<QueryClientProvider client={client}>
				<Story />
			</QueryClientProvider>
		)
	}
}

const withPageFrame: Decorator = Story => (
	<div className="min-h-full w-full flex justify-center p-4">
		<div className="wish-page w-full max-w-3xl border border-dashed border-muted-foreground/40 rounded-lg p-4 xs:p-6 bg-background/50">
			<Story />
		</div>
	</div>
)

type PreviewProps = { recipient?: { kind: 'user' | 'dependent'; name: string } }

function ListDetailPreview({ recipient = { kind: 'user', name: 'Linda' } }: PreviewProps) {
	return (
		<div className="flex flex-col flex-1 gap-6">
			{/* HEADING (mirrors ListDetailBody) */}
			<div className="flex flex-col gap-1">
				<div className="flex items-center gap-1 xs:gap-3 min-w-0">
					{recipient.kind === 'dependent' ? (
						<DependentAvatar name={recipient.name} image={null} size="large" className="border-2 border-background" />
					) : (
						<UserAvatar name={recipient.name} image={null} size="large" className="border-2 border-background" />
					)}
					<ListTypeTile type="christmas" />
					<h1 className="truncate">{recipient.kind === 'dependent' ? `${recipient.name}'s Christmas 2026` : LIST_NAME}</h1>
				</div>
			</div>
			<MarkdownNotes content="Cozy stuff, garden stuff, and please no more candles." className="text-muted-foreground" />

			<Suspense fallback={<ItemListSkeleton />}>
				<ItemList listId={LIST_ID} />
			</Suspense>

			<GiftIdeasOnList listId={LIST_ID} recipientName={recipient.name} />

			<Suspense fallback={<ListAddonsSectionSkeleton />}>
				<ListAddonsSection listId={LIST_ID} />
			</Suspense>
		</div>
	)
}

const meta = {
	title: 'Pages/List Detail/Gift Ideas',
	component: ListDetailPreview,
	parameters: { layout: 'fullscreen', session: { user: viewerUser } },
	decorators: [withPageFrame, seeded([myIdeas, jamiesIdeas])],
} satisfies Meta<typeof ListDetailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
	parameters: {
		docs: {
			description: {
				story:
					'Viewer owns "Ideas for Linda" and edits Jamie\'s "Linda stocking stuffers". Jamie\'s earlier claim already moved the Rummikub idea into Off-List Gifts.',
			},
		},
	},
}

export const ClaimOpensPrefilledDialog: Story = {
	parameters: {
		docs: {
			description: {
				story: 'Claim opens the Off-List Gift dialog titled "Claim idea", prefilled from the idea; a "$140" price carries over as 140.00.',
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const row = (await canvas.findByText('Pottery wheel class for two at Clay Studio on 4th')).closest('[id^="item-"]') as HTMLElement
		await userEvent.click(within(row).getByRole('button', { name: /claim/i }))
		const body = within(document.body)
		await waitFor(() => expect(body.getByText('Claim idea')).toBeInTheDocument())
		await expect(body.getByLabelText('What is it?')).toHaveValue('Pottery wheel class for two at Clay Studio on 4th')
		await expect(body.getByLabelText('Total cost (optional)')).toHaveValue(140)
		await expect(body.getByRole('button', { name: 'Claim' })).toBeInTheDocument()
	},
}

export const AfterClaimingAnIdea: Story = {
	decorators: [
		seeded(
			[{ ...myIdeas, items: [watercolor, cashmere] }, jamiesIdeas],
			[...existingAddons, addon(3, viewerUser, pottery.title, '140.00', { notes: pottery.notes })]
		),
	],
	parameters: {
		docs: {
			description: {
				story: 'The viewer claimed the pottery class: it is gone from Gift Ideas and now appears in Off-List Gifts as their addon.',
			},
		},
	},
}

export const IdeaUsedOnAnotherList: Story = {
	decorators: [seeded([{ ...myIdeas, items: [pottery, watercolor] }, jamiesIdeas])],
	parameters: {
		docs: {
			description: {
				story:
					"Jamie claimed the cashmere wrap from Linda's Birthday list. It's gone here too, and lives in that list's Off-List Gifts, not this one's.",
			},
		},
	},
}

export const UnavailableIdea: Story = {
	decorators: [
		seeded([
			{
				...myIdeas,
				items: [
					pottery,
					idea({ id: 304, title: 'Discontinued Hario kettle (gooseneck, copper)', availability: 'unavailable', price: '95' }),
				],
			},
		]),
	],
	parameters: {
		docs: { description: { story: 'Unavailable ideas still show (they can spark an idea) with the red badge and no Claim button.' } },
	},
}

export const OnlyYourOwnIdeasList: Story = {
	decorators: [seeded([myIdeas])],
}

export const NoGiftIdeas: Story = {
	decorators: [seeded([])],
	parameters: {
		docs: {
			description: { story: 'No usable ideas for Linda (no list, or every idea used): the section is absent and the page matches today.' },
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await canvas.findByText('Off-List Gifts')
		await expect(canvas.queryByText('Gift Ideas')).not.toBeInTheDocument()
	},
}

export const DependentRecipient: Story = {
	args: { recipient: { kind: 'dependent', name: 'Mochi' } },
	decorators: [
		seeded(
			[
				{
					list: { id: 205, name: 'Mochi ideas' },
					owner: viewerUser,
					viewerIsOwner: true,
					items: [
						idea({ id: 351, listId: 205, title: 'Salmon training treats', price: '12' }),
						idea({ id: 352, listId: 205, title: 'Heated cat bed' }),
					],
				},
			],
			[]
		),
	],
	parameters: {
		docs: {
			description: {
				story:
					"A guardian viewing their own dependent's list: ideas targeting the dependent show, and claiming works (the guardian is a gifter here).",
			},
		},
	},
}

export const ManySourcesAndLongNames: Story = {
	decorators: [
		seeded([
			myIdeas,
			jamiesIdeas,
			{
				list: {
					id: 206,
					name: 'A very long gift ideas list name that has to truncate on narrow screens without pushing the owner badge off',
				},
				owner: { id: 'friend-4', name: 'Robin Cousin-With-A-Long-Hyphenated-Name', email: 'robin@example.com', image: null },
				viewerIsOwner: false,
				items: [
					idea({
						id: 361,
						listId: 206,
						title: 'An extremely long gift idea title that goes on and on so we can verify truncation behaves nicely on narrow viewports',
						url: 'https://www.some-extremely-long-retailer-domain-name.example.com/products/category/item?variant=12345',
					}),
				],
			},
		]),
	],
}
