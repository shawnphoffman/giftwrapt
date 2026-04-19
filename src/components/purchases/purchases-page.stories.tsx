import type { Meta, StoryObj } from '@storybook/react-vite'

import type { AddonPurchaseRow, PurchaseRow } from '@/api/purchases'

import { PurchasesPageContent } from './purchases-page'

/**
 * Buyer's purchase history page: combined claims (gifts on list items) and
 * addons (off-list gifts). Supports grouping by list owner and timeframe
 * filtering. Stories set `session: { user: viewer }` so the header avatar
 * and edit dialog work; they don't trigger server mutations.
 */

const viewer = {
	id: 'viewer-1',
	name: 'Alex Buyer',
	email: 'alex@example.com',
	image: null,
}

function daysAgo(n: number): Date {
	const d = new Date()
	d.setDate(d.getDate() - n)
	return d
}

function claim(overrides: Partial<PurchaseRow>): PurchaseRow {
	return {
		type: 'claim',
		giftId: 1,
		itemId: 1,
		itemTitle: 'Bluetooth headphones',
		itemUrl: 'https://www.amazon.com/dp/B0863TXGM3',
		itemPrice: '349.99',
		quantity: 1,
		totalCost: null,
		notes: null,
		createdAt: daysAgo(3),
		listId: 10,
		listName: 'Christmas 2026',
		listOwnerId: 'owner-jamie',
		listOwnerName: 'Jamie Friend',
		listOwnerEmail: 'jamie@example.com',
		listOwnerImage: null,
		...overrides,
	}
}

function addon(overrides: Partial<AddonPurchaseRow>): AddonPurchaseRow {
	return {
		type: 'addon',
		addonId: 1,
		description: 'Handmade card',
		totalCost: '8.00',
		notes: null,
		isArchived: false,
		createdAt: daysAgo(5),
		listId: 10,
		listName: 'Christmas 2026',
		listOwnerId: 'owner-jamie',
		listOwnerName: 'Jamie Friend',
		listOwnerEmail: 'jamie@example.com',
		listOwnerImage: null,
		...overrides,
	}
}

const claims: Array<PurchaseRow> = [
	claim({ giftId: 1, itemTitle: 'Bluetooth headphones', totalCost: '349.99', createdAt: daysAgo(2) }),
	claim({
		giftId: 2,
		itemId: 2,
		itemTitle: 'Hand-thrown ceramic mug',
		itemUrl: 'https://www.etsy.com/listing/12345/handmade-mug',
		totalCost: '42.00',
		notes: 'Cream glaze, not the sage one.',
		createdAt: daysAgo(10),
	}),
	claim({
		giftId: 3,
		itemId: 3,
		itemTitle: 'Wine glasses',
		itemUrl: null,
		quantity: 4,
		totalCost: '48.00',
		createdAt: daysAgo(18),
	}),
	claim({
		giftId: 4,
		itemId: 4,
		itemTitle: 'Nintendo Switch OLED',
		totalCost: '349.99',
		listId: 20,
		listName: 'Birthday',
		listOwnerId: 'owner-sam',
		listOwnerName: 'Sam Sibling',
		listOwnerEmail: 'sam@example.com',
		createdAt: daysAgo(25),
	}),
	claim({
		giftId: 5,
		itemId: 5,
		itemTitle: 'A really really really really really really long product title that should truncate',
		totalCost: null,
		listId: 20,
		listName: 'Birthday',
		listOwnerId: 'owner-sam',
		listOwnerName: 'Sam Sibling',
		listOwnerEmail: 'sam@example.com',
		createdAt: daysAgo(40),
	}),
	claim({
		giftId: 6,
		itemId: 6,
		itemTitle: 'Gardening gloves',
		itemUrl: 'https://example.com/gloves',
		totalCost: '18.50',
		listId: 30,
		listName: 'Wish List',
		listOwnerId: 'owner-morgan',
		listOwnerName: null,
		listOwnerEmail: 'morgan@example.com',
		createdAt: daysAgo(90),
	}),
]

const addons: Array<AddonPurchaseRow> = [
	addon({ addonId: 1, description: 'Handmade card', totalCost: '8.00', createdAt: daysAgo(4) }),
	addon({
		addonId: 2,
		description: 'Gift wrap and ribbon',
		totalCost: '6.25',
		notes: 'Bought at the corner shop.',
		createdAt: daysAgo(12),
	}),
	addon({
		addonId: 3,
		description: 'Flowers from the farmer\u2019s market',
		totalCost: '24.00',
		isArchived: true,
		listId: 20,
		listName: 'Birthday',
		listOwnerId: 'owner-sam',
		listOwnerName: 'Sam Sibling',
		listOwnerEmail: 'sam@example.com',
		createdAt: daysAgo(35),
	}),
]

const meta = {
	title: 'Pages/Purchases',
	component: PurchasesPageContent,
	parameters: {
		layout: 'padded',
		session: { user: viewer },
	},
} satisfies Meta<typeof PurchasesPageContent>

export default meta
type Story = StoryObj<typeof meta>

export const MultipleEntries: Story = {
	args: { claims, addons },
}

export const ClaimsOnly: Story = {
	args: { claims, addons: [] },
}

export const AddonsOnly: Story = {
	args: { claims: [], addons },
}

export const SingleEntry: Story = {
	args: {
		claims: [claim({ giftId: 1, itemTitle: 'Cashmere beanie', totalCost: '65.00' })],
		addons: [],
	},
}

export const Empty: Story = {
	args: { claims: [], addons: [] },
}
