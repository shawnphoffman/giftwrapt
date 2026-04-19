import type { Meta, StoryObj } from '@storybook/react-vite'

import type { SummaryItem } from '@/api/purchases'

import { PurchasesSummaryContent } from './purchases-summary'

/**
 * Spending summary grouped by recipient. Each row is collapsible, with an
 * edit link on each item belonging to the current user. Partners are shown
 * combined when the current user's partner is also a buyer.
 */

function item(overrides: Partial<SummaryItem>): SummaryItem {
	return {
		type: 'claim',
		giftId: 1,
		addonId: null,
		isOwn: true,
		isCoGifter: false,
		title: 'Untitled',
		cost: null,
		totalCostRaw: null,
		notes: null,
		quantity: 1,
		listName: 'Wish List',
		createdAt: new Date(),
		ownerId: 'user-1',
		ownerName: 'Owner',
		ownerEmail: 'owner@example.com',
		ownerImage: null,
		ownerPartnerId: null,
		...overrides,
	}
}

const jamieItems: Array<SummaryItem> = [
	item({ giftId: 11, title: 'Bluetooth headphones', cost: 349.99, totalCostRaw: '349.99', listName: 'Christmas 2026', ownerId: 'user-jamie', ownerName: 'Jamie Friend', ownerEmail: 'jamie@example.com' }),
	item({ giftId: 12, title: 'Hand-thrown ceramic mug', cost: 42, totalCostRaw: '42.00', listName: 'Christmas 2026', ownerId: 'user-jamie', ownerName: 'Jamie Friend', ownerEmail: 'jamie@example.com' }),
	item({ giftId: 13, title: 'Wine glasses', cost: 48, totalCostRaw: '48.00', quantity: 4, listName: 'Christmas 2026', ownerId: 'user-jamie', ownerName: 'Jamie Friend', ownerEmail: 'jamie@example.com' }),
	item({ type: 'addon', giftId: null, addonId: 21, title: 'Handmade card', cost: 10, totalCostRaw: '10.00', listName: 'Christmas 2026', ownerId: 'user-jamie', ownerName: 'Jamie Friend', ownerEmail: 'jamie@example.com' }),
]

const samItems: Array<SummaryItem> = [
	item({ giftId: 31, title: 'Nintendo Switch OLED', cost: 349.99, totalCostRaw: '349.99', listName: 'Birthday', ownerId: 'user-sam', ownerName: 'Sam Sibling', ownerEmail: 'sam@example.com', ownerPartnerId: 'user-jordan' }),
	item({ giftId: 32, title: 'Extra Joy-Con pair', cost: null, totalCostRaw: null, listName: 'Birthday', ownerId: 'user-sam', ownerName: 'Sam Sibling', ownerEmail: 'sam@example.com', ownerPartnerId: 'user-jordan' }),
	item({ type: 'addon', giftId: null, addonId: 41, title: 'Flowers', cost: 24, totalCostRaw: '24.00', listName: 'Birthday', ownerId: 'user-sam', ownerName: 'Sam Sibling', ownerEmail: 'sam@example.com', ownerPartnerId: 'user-jordan' }),
]

const morganItems: Array<SummaryItem> = [
	item({ giftId: 51, title: 'Gardening gloves', cost: 18.5, totalCostRaw: '18.50', listName: 'Wish List', ownerId: 'user-morgan', ownerName: null, ownerEmail: 'morgan@example.com' }),
]

const rileyItems: Array<SummaryItem> = [
	item({ giftId: 61, title: 'Smart garden starter kit', cost: 120, totalCostRaw: '120.00', listName: 'Wishlist', ownerId: 'user-riley', ownerName: 'Riley Rivera', ownerEmail: 'riley@example.com' }),
]

const coGifterItems: Array<SummaryItem> = [
	// Primary-gifter claim for the current user: editable, full price.
	item({ giftId: 71, title: 'Kitchen mixer', cost: 320, totalCostRaw: '320.00', listName: 'Wedding', ownerId: 'user-avery', ownerName: 'Avery Cousin', ownerEmail: 'avery@example.com' }),
	// Co-gifter on someone else's claim: $0 and not editable.
	item({ giftId: 72, title: 'Espresso machine', isOwn: false, isCoGifter: true, cost: 0, totalCostRaw: null, listName: 'Wedding', ownerId: 'user-avery', ownerName: 'Avery Cousin', ownerEmail: 'avery@example.com' }),
]

const allItems = [...jamieItems, ...samItems, ...morganItems, ...rileyItems, ...coGifterItems]

const meta = {
	title: 'Pages/PurchasesSummary',
	component: PurchasesSummaryContent,
	parameters: {
		layout: 'padded',
	},
} satisfies Meta<typeof PurchasesSummaryContent>

export default meta
type Story = StoryObj<typeof meta>

export const MultiplePeople: Story = {
	args: { items: allItems },
}

export const SinglePerson: Story = {
	args: { items: jamieItems },
}

export const WithPartner: Story = {
	args: { items: samItems },
}

export const WithCoGifter: Story = {
	args: { items: coGifterItems },
}

export const Empty: Story = {
	args: { items: [] },
}
