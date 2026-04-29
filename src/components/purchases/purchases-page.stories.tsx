import type { Meta, StoryObj } from '@storybook/react-vite'

import type { SummaryItem } from '@/api/purchases'

import { withPageContainer } from '../../../.storybook/decorators'
import { PurchasesPageContent } from './purchases-page'

/**
 * Unified purchases page: spending metrics, monthly bar chart, and a
 * collapsible per-recipient breakdown with rich detail rows (markdown notes,
 * external links, edit button). Partners collapse into one group when both
 * are recipients of the same list.
 */

function daysAgo(n: number): Date {
	const d = new Date()
	d.setDate(d.getDate() - n)
	return d
}

function item(overrides: Partial<SummaryItem>): SummaryItem {
	return {
		type: 'claim',
		giftId: 1,
		addonId: null,
		isOwn: true,
		isCoGifter: false,
		title: 'Untitled',
		itemUrl: null,
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
	item({
		giftId: 11,
		title: 'Bluetooth headphones',
		itemUrl: 'https://www.amazon.com/dp/B0863TXGM3',
		cost: 349.99,
		totalCostRaw: '349.99',
		listName: 'Christmas 2026',
		createdAt: daysAgo(3),
		ownerId: 'user-jamie',
		ownerName: 'Jamie Friend',
		ownerEmail: 'jamie@example.com',
	}),
	item({
		giftId: 12,
		title: 'Hand-thrown ceramic mug',
		itemUrl: 'https://www.etsy.com/listing/12345/handmade-mug',
		cost: 42,
		totalCostRaw: '42.00',
		notes: 'Cream glaze, **not** the sage one.',
		listName: 'Christmas 2026',
		createdAt: daysAgo(12),
		ownerId: 'user-jamie',
		ownerName: 'Jamie Friend',
		ownerEmail: 'jamie@example.com',
	}),
	item({
		giftId: 13,
		title: 'Wine glasses',
		cost: 48,
		totalCostRaw: '48.00',
		quantity: 4,
		listName: 'Christmas 2026',
		createdAt: daysAgo(40),
		ownerId: 'user-jamie',
		ownerName: 'Jamie Friend',
		ownerEmail: 'jamie@example.com',
	}),
	item({
		type: 'addon',
		giftId: null,
		addonId: 21,
		title: 'Handmade card',
		cost: 10,
		totalCostRaw: '10.00',
		listName: 'Christmas 2026',
		createdAt: daysAgo(5),
		ownerId: 'user-jamie',
		ownerName: 'Jamie Friend',
		ownerEmail: 'jamie@example.com',
	}),
]

const samItems: Array<SummaryItem> = [
	item({
		giftId: 31,
		title: 'Nintendo Switch OLED',
		itemUrl: 'https://www.nintendo.com/store/products/nintendo-switch-oled-model-white-set/',
		cost: 349.99,
		totalCostRaw: '349.99',
		listName: 'Birthday',
		createdAt: daysAgo(60),
		ownerId: 'user-sam',
		ownerName: 'Sam Sibling',
		ownerEmail: 'sam@example.com',
		ownerPartnerId: 'user-jordan',
	}),
	item({
		giftId: 32,
		title: 'Extra Joy-Con pair',
		cost: null,
		totalCostRaw: null,
		listName: 'Birthday',
		createdAt: daysAgo(60),
		ownerId: 'user-sam',
		ownerName: 'Sam Sibling',
		ownerEmail: 'sam@example.com',
		ownerPartnerId: 'user-jordan',
	}),
	item({
		type: 'addon',
		giftId: null,
		addonId: 41,
		title: 'Flowers',
		cost: 24,
		totalCostRaw: '24.00',
		notes: 'Picked up at the corner florist.',
		listName: 'Birthday',
		createdAt: daysAgo(55),
		ownerId: 'user-sam',
		ownerName: 'Sam Sibling',
		ownerEmail: 'sam@example.com',
		ownerPartnerId: 'user-jordan',
	}),
]

const morganItems: Array<SummaryItem> = [
	item({
		giftId: 51,
		title: 'Gardening gloves',
		cost: 18.5,
		totalCostRaw: '18.50',
		listName: 'Wish List',
		createdAt: daysAgo(90),
		ownerId: 'user-morgan',
		ownerName: null,
		ownerEmail: 'morgan@example.com',
	}),
]

const rileyItems: Array<SummaryItem> = [
	item({
		giftId: 61,
		title: 'Smart garden starter kit',
		cost: 120,
		totalCostRaw: '120.00',
		listName: 'Wishlist',
		createdAt: daysAgo(150),
		ownerId: 'user-riley',
		ownerName: 'Riley Rivera',
		ownerEmail: 'riley@example.com',
	}),
]

const coGifterItems: Array<SummaryItem> = [
	item({
		giftId: 71,
		title: 'Kitchen mixer',
		cost: 320,
		totalCostRaw: '320.00',
		listName: 'Wedding',
		createdAt: daysAgo(20),
		ownerId: 'user-avery',
		ownerName: 'Avery Cousin',
		ownerEmail: 'avery@example.com',
	}),
	item({
		giftId: 72,
		title: 'Espresso machine',
		isOwn: false,
		isCoGifter: true,
		cost: 0,
		totalCostRaw: null,
		listName: 'Wedding',
		createdAt: daysAgo(20),
		ownerId: 'user-avery',
		ownerName: 'Avery Cousin',
		ownerEmail: 'avery@example.com',
	}),
]

const allItems = [...jamieItems, ...samItems, ...morganItems, ...rileyItems, ...coGifterItems]

const meta = {
	title: 'Pages/Purchases',
	component: PurchasesPageContent,
	parameters: {
		layout: 'fullscreen',
	},
	decorators: [withPageContainer],
} satisfies Meta<typeof PurchasesPageContent>

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
