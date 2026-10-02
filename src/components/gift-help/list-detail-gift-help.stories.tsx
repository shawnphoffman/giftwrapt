import type { Decorator, Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'

import type { GiftIdeasSource } from '@/api/gift-ideas'
import type { AddonOnList, ItemWithGifts } from '@/api/lists'
import ListTypeTile from '@/components/common/list-type-tile'
import { MarkdownNotes } from '@/components/common/markdown-notes'
import UserAvatar from '@/components/common/user-avatar'
import { GiftIdeasOnList } from '@/components/gift-ideas/gift-ideas-section'
import { makeGift, makeItemWithGifts, NOW, otherGifter, thirdGifter, viewerUser } from '@/components/items/_stories/fixtures'
import ItemList from '@/components/items/item-list'
import { ItemListSkeleton } from '@/components/items/item-list-skeleton'
import { ListAddonsSection } from '@/components/list-addons/list-addons-section'
import { ListAddonsSectionSkeleton } from '@/components/list-addons/list-addons-section-skeleton'
import { appSettingsQueryKey } from '@/hooks/use-app-settings'
import { itemsKeys } from '@/lib/queries/items'
import { listDetailKeys } from '@/lib/queries/lists'
import { DEFAULT_APP_SETTINGS } from '@/lib/settings'

import { GiftHelpOnList } from './gift-help-panel'

/**
 * Where the Help Me Choose panel sits on the page: the gifter's view of
 * someone else's list, in the same order as the real route
 * (`ListDetailBody`): heading, items, Help Me Choose, Gift Ideas, Off-List
 * Gifts. It is an inline panel, not a dialog, and only renders when the
 * admin has turned Gift Suggestions on.
 *
 * Press Pick for Me or Need Ideas? to see the results; the ideas come
 * from a stubbed API here.
 */

const LIST_ID = 42

const listItems: Array<ItemWithGifts> = [
	makeItemWithGifts({
		id: 1,
		listId: LIST_ID,
		title: 'Le Creuset Dutch oven, 5.5 qt, Sea Salt',
		price: '420',
		priority: 'high',
		url: 'https://www.lecreuset.com/round-dutch-oven/21177.html',
		vendorId: 'lecreuset.com',
		gifts: [makeGift({ itemId: 1, gifterId: otherGifter.id, gifter: otherGifter })],
	}),
	makeItemWithGifts({
		id: 2,
		listId: LIST_ID,
		title: 'Kindle Paperwhite Signature Edition',
		price: '189.99',
		priority: 'high',
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
	makeItemWithGifts({ id: 4, listId: LIST_ID, title: 'Linen apron, natural', price: '38', url: null, vendorId: null }),
]

const myIdeas: GiftIdeasSource = {
	list: { id: 201, name: 'Ideas for Linda' },
	owner: viewerUser,
	viewerIsOwner: true,
	items: [
		makeItemWithGifts({
			id: 301,
			listId: 201,
			title: 'Pottery wheel class for two',
			price: '$140',
			url: null,
			vendorId: null,
			createdAt: NOW,
		}),
	],
}

const addons: Array<AddonOnList> = [
	{
		id: 1,
		listId: LIST_ID,
		userId: thirdGifter.id,
		description: 'Gift card to Blue Heron Bistro',
		totalCost: '75',
		notes: null,
		url: null,
		imageUrl: null,
		createdAt: NOW,
		user: thirdGifter,
	},
]

function seeded(flagOn: boolean): Decorator {
	return Story => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
		const pinned = { refetchOnMount: false, refetchOnWindowFocus: false, refetchOnReconnect: false } as const
		client.setQueryDefaults(itemsKeys.byList(LIST_ID), pinned)
		client.setQueryDefaults(listDetailKeys.byList(LIST_ID), pinned)
		client.setQueryDefaults(appSettingsQueryKey, pinned)
		client.setQueryData(itemsKeys.view(LIST_ID, 'priority-desc'), listItems)
		client.setQueryData(listDetailKeys.addons(LIST_ID), addons)
		client.setQueryData(listDetailKeys.giftIdeas(LIST_ID), [myIdeas])
		client.setQueryData(appSettingsQueryKey, { ...DEFAULT_APP_SETTINGS, aiGiftSuggestionsEnabled: flagOn })
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

function ListDetailPreview() {
	return (
		<div className="flex flex-col flex-1 gap-6">
			<div className="flex flex-col gap-1">
				<div className="flex items-center gap-1 xs:gap-3 min-w-0">
					<UserAvatar name="Linda" image={null} size="large" className="border-2 border-background" />
					<ListTypeTile type="christmas" />
					<h1 className="truncate">Linda’s Christmas 2026</h1>
				</div>
			</div>
			<MarkdownNotes content="Cozy stuff, garden stuff, and please no more candles." className="text-muted-foreground" />

			<Suspense fallback={<ItemListSkeleton />}>
				<ItemList listId={LIST_ID} />
			</Suspense>

			<Suspense fallback={null}>
				<GiftHelpOnList listId={LIST_ID} groups={[]} recipientName="Linda" />
			</Suspense>

			<Suspense fallback={null}>
				<GiftIdeasOnList listId={LIST_ID} recipientName="Linda" />
			</Suspense>

			<Suspense fallback={<ListAddonsSectionSkeleton />}>
				<ListAddonsSection listId={LIST_ID} />
			</Suspense>
		</div>
	)
}

const meta = {
	title: 'Pages/List Detail/Help Me Choose',
	component: ListDetailPreview,
	parameters: { layout: 'fullscreen', session: { user: viewerUser } },
	decorators: [withPageFrame],
} satisfies Meta<typeof ListDetailPreview>

export default meta
type Story = StoryObj<typeof meta>

/** Gift Suggestions turned on: the panel sits between the items and Gift Ideas. */
export const FlagOn: Story = { decorators: [seeded(true)] }

/** The default: with the flag off the page is exactly as it was, with no panel. */
export const FlagOff: Story = { decorators: [seeded(false)] }
