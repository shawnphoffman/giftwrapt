import type { Decorator, Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

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

import { GiftHelpButton, GiftHelpDialogView } from './gift-help-dialog'

/**
 * Gift help for someone shopping from another person's list: a "Need
 * Ideas?" button in the list's filter row opens a dialog that asks for a
 * budget, then shows ideas from an AI model that are not already on the
 * list. Each idea can be saved to the viewer's private Gift Ideas or added
 * to the list as an off-list gift. The button only renders when the admin
 * has turned Gift Suggestions on, and never for a child account.
 *
 * The "On the Page" stories are the real list view with seeded data; the
 * rest are the dialog on its own in each state.
 */

// ─── The dialog on its own ──────────────────────────────────────────────────

const suggestions = [
	{
		title: 'Enameled Cast Iron Braiser',
		details:
			'A wide, shallow lidded pan around 3.5 quarts, the natural companion to a Dutch oven. Look for a light interior enamel so browning is easy to see, and a lid that is oven-safe to at least 450 degrees.',
		reason: 'She asked for a Dutch oven, so cookware in the same style should suit her kitchen.',
		priceBand: '100-250' as const,
	},
	{
		title: 'Bypass Pruning Shears',
		details:
			'Hand pruners with a hardened steel bypass blade and a replaceable spring, sized for a medium hand. A model that can be taken apart for sharpening will last for years.',
		reason: 'There is a hydrangea for the side yard on her list.',
		priceBand: '25-50' as const,
	},
]

const meta = {
	title: 'Gift Help/Need Ideas Dialog',
	component: GiftHelpDialogView,
	parameters: { layout: 'fullscreen', session: { user: viewerUser } },
	args: {
		open: true,
		onOpenChange: fn(),
		recipientName: 'Linda',
		interests: [],
		step: 'form',
		budget: '',
		onBudgetChange: fn(),
		onSubmit: fn(),
		onBack: fn(),
		suggestions: { phase: 'idle' },
		savedTitles: new Set<string>(),
		savingTitle: null,
		onSaveIdea: fn(),
		addedTitles: new Set<string>(),
		addingTitle: null,
		onAddOffList: fn(),
	},
} satisfies Meta<typeof GiftHelpDialogView>

export default meta
type Story = StoryObj<typeof meta>

/** Step one: the questions. */
export const Questions: Story = {}

export const QuestionsWithInterests: Story = {
	args: {
		interests: [
			{ category: 'home-kitchen', count: 6 },
			{ category: 'tools-garden', count: 3 },
		],
	},
}

/** Step two while the model works: placeholder cards and a status line that moves on every few seconds. */
export const Thinking: Story = {
	args: { step: 'results', budget: '200', suggestions: { phase: 'loading' } },
	play: async ({ canvasElement }) => {
		const screen = within(canvasElement.ownerDocument.body)
		await expect(await screen.findByRole('status')).toHaveTextContent('Reading their list…')
	},
}

export const Results: Story = { args: { step: 'results', budget: '200', suggestions: { phase: 'done', suggestions } } }

/** One idea saved to Gift Ideas, the other added to the list as an off-list gift. */
export const ResultsActedOn: Story = {
	args: {
		step: 'results',
		budget: '200',
		suggestions: { phase: 'done', suggestions },
		savedTitles: new Set(['Bypass Pruning Shears']),
		addedTitles: new Set(['Enameled Cast Iron Braiser']),
	},
}

export const NoNewIdeas: Story = { args: { step: 'results', budget: '10', suggestions: { phase: 'done', suggestions: [] } } }

export const IdeasFailed: Story = {
	args: { step: 'results', suggestions: { phase: 'error', message: 'Gift suggestions are paused for this month.' } },
}

// ─── On the page ────────────────────────────────────────────────────────────

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

// Mirrors `ListDetailBody`: heading, items (with the button in the filter
// row), Gift Ideas, Off-List Gifts.
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
				<ItemList
					listId={LIST_ID}
					filterBarLeading={
						<Suspense fallback={null}>
							<GiftHelpButton listId={LIST_ID} recipientName="Linda" />
						</Suspense>
					}
				/>
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

/** Gift Suggestions on: a "Need ideas?" button joins the filter row. Press it to walk through the dialog. */
export const OnThePage: Story = {
	decorators: [withPageFrame, seeded(true)],
	render: () => <ListDetailPreview />,
}

/** The default. With the flag off there is no button and the page is exactly as it was. */
export const OnThePageFlagOff: Story = {
	decorators: [withPageFrame, seeded(false)],
	render: () => <ListDetailPreview />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await waitFor(() => expect(canvas.getByText('Linen apron, natural')).toBeInTheDocument())
		await expect(canvas.queryByRole('button', { name: /Need ideas/u })).toBeNull()
	},
}

/** The whole flow: open from the filter row, give a budget, and read the AI ideas. */
export const OnThePageFullFlow: Story = {
	decorators: [withPageFrame, seeded(true)],
	render: () => <ListDetailPreview />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		// The dialog renders in a portal, so query the whole document for it.
		const screen = within(canvasElement.ownerDocument.body)
		await userEvent.click(await canvas.findByRole('button', { name: /Need ideas/u }))
		await userEvent.type(await screen.findByLabelText('Budget (Optional)'), '200')
		await userEvent.click(screen.getByRole('button', { name: /Find Ideas/u }))
		const dialog = within(await screen.findByRole('dialog'))
		// The stubbed AI ideas, each with both actions; no list picks and no section headers.
		await waitFor(() => expect(dialog.getByText('Enameled Cast Iron Braiser')).toBeInTheDocument())
		await expect(dialog.queryByText(/Linda’s List/u)).toBeNull()
		await expect(dialog.getAllByRole('button', { name: 'Add as Off-List Gift' }).length).toBeGreaterThan(0)
		await expect(dialog.getAllByRole('button', { name: 'Save to Gift Ideas' }).length).toBeGreaterThan(0)
	},
}
