import type { Meta, StoryObj } from '@storybook/react-vite'

import type { GiftOnItem, ItemWithGifts } from '@/api/lists'

import ItemRow from './item-row'

/**
 * Gift buyer's view of a list item — what someone looking at a friend or
 * family member's wish list sees. This is where claims live: buyers can
 * claim a slot, see who else has claimed, and edit/unclaim their own claim.
 */

const now = new Date('2026-04-01T00:00:00Z')

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

const thirdGifter = {
	id: 'friend-3',
	name: 'Sam Sibling',
	email: 'sam@example.com',
	image: null,
}

function makeItem(overrides: Partial<ItemWithGifts> = {}): ItemWithGifts {
	return {
		id: 1,
		listId: 1,
		groupId: null,
		title: 'Bluetooth headphones',
		status: 'incomplete',
		availability: 'available',
		url: 'https://www.amazon.com/dp/B0863TXGM3',
		imageUrl: null,
		price: '$349.99',
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
		gifts: [],
		commentCount: 0,
		...overrides,
	}
}

function makeGift(overrides: Partial<GiftOnItem> = {}): GiftOnItem {
	return {
		id: 1,
		itemId: 1,
		gifterId: otherGifter.id,
		quantity: 1,
		notes: null,
		totalCost: null,
		additionalGifterIds: null,
		createdAt: now,
		gifter: otherGifter,
		...overrides,
	}
}

const meta = {
	title: 'Items/ItemRow (buyer view)',
	component: ItemRow,
	parameters: {
		layout: 'padded',
		// Default: viewer is signed in as themselves. Individual stories can
		// override with `session: null` to see the signed-out experience.
		session: { user: viewerUser },
	},
	decorators: [
		Story => (
			<div className="max-w-2xl border rounded-md bg-background">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof ItemRow>

export default meta
type Story = StoryObj<typeof meta>

export const Unclaimed: Story = {
	args: {
		item: makeItem(),
	},
}

export const WithNotesAndImage: Story = {
	args: {
		item: makeItem({
			title: 'Hand-thrown ceramic mug',
			url: 'https://www.etsy.com/listing/12345/handmade-mug',
			imageUrl: 'https://placehold.co/200x200/png?text=Mug',
			notes: 'Any neutral color works — **cream, sage, or stone** preferred over bright glazes.',
			price: '$42',
			priority: 'high',
		}),
	},
}

export const ClaimedByAnother: Story = {
	args: {
		item: makeItem({
			gifts: [makeGift()],
		}),
	},
}

export const ClaimedByYou: Story = {
	args: {
		item: makeItem({
			gifts: [
				makeGift({
					id: 5,
					gifterId: viewerUser.id,
					gifter: viewerUser,
				}),
			],
		}),
	},
}

export const PartiallyClaimedMultipleGifters: Story = {
	args: {
		item: makeItem({
			title: 'Wine glasses',
			quantity: 6,
			price: '$12 each',
			gifts: [makeGift({ id: 1, quantity: 2 }), makeGift({ id: 2, quantity: 2, gifterId: thirdGifter.id, gifter: thirdGifter })],
		}),
	},
}

export const FullyClaimedByOthers: Story = {
	args: {
		item: makeItem({
			title: 'Espresso machine',
			price: '$699',
			priority: 'very-high',
			gifts: [makeGift({ quantity: 1 })],
		}),
	},
}

export const SignedOutVisitor: Story = {
	args: {
		item: makeItem({
			gifts: [makeGift()],
		}),
	},
	parameters: {
		session: null,
	},
}
