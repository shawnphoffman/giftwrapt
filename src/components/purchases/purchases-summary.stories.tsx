import type { Meta, StoryObj } from '@storybook/react-vite'

import type { PersonSummary } from '@/api/purchases'

import { PurchasesSummaryContent } from './purchases-summary'

/**
 * Spending summary grouped by recipient. Each card is collapsible and
 * totals roll up into a grand total. Partners are shown combined when the
 * current user's partner is also a buyer.
 */

function summary(overrides: Partial<PersonSummary>): PersonSummary {
	return {
		userId: 'user-1',
		name: 'Jamie Friend',
		email: 'jamie@example.com',
		partnerUserId: null,
		partnerName: null,
		claimCount: 0,
		addonCount: 0,
		totalSpent: 0,
		items: [],
		...overrides,
	}
}

const summaries: Array<PersonSummary> = [
	summary({
		userId: 'user-jamie',
		name: 'Jamie Friend',
		claimCount: 3,
		addonCount: 1,
		totalSpent: 449.99,
		items: [
			{ type: 'claim', title: 'Bluetooth headphones', cost: 349.99, quantity: 1, listName: 'Christmas 2026' },
			{ type: 'claim', title: 'Hand-thrown ceramic mug', cost: 42, quantity: 1, listName: 'Christmas 2026' },
			{ type: 'claim', title: 'Wine glasses', cost: 48, quantity: 4, listName: 'Christmas 2026' },
			{ type: 'addon', title: 'Handmade card', cost: 10, quantity: 1, listName: 'Christmas 2026' },
		],
	}),
	summary({
		userId: 'user-sam',
		name: 'Sam Sibling',
		partnerUserId: 'user-jordan',
		partnerName: 'Jordan',
		claimCount: 2,
		addonCount: 1,
		totalSpent: 389.49,
		items: [
			{ type: 'claim', title: 'Nintendo Switch OLED', cost: 349.99, quantity: 1, listName: 'Birthday' },
			{ type: 'claim', title: 'Extra Joy-Con pair', cost: null, quantity: 1, listName: 'Birthday' },
			{ type: 'addon', title: 'Flowers', cost: 24, quantity: 1, listName: 'Birthday' },
		],
	}),
	summary({
		userId: 'user-morgan',
		name: null,
		email: 'morgan@example.com',
		claimCount: 1,
		addonCount: 0,
		totalSpent: 18.5,
		items: [{ type: 'claim', title: 'Gardening gloves', cost: 18.5, quantity: 1, listName: 'Wish List' }],
	}),
	summary({
		userId: 'user-riley',
		name: 'Riley Rivera',
		claimCount: 1,
		addonCount: 0,
		totalSpent: 120,
		items: [{ type: 'claim', title: 'Smart garden starter kit', cost: 120, quantity: 1, listName: 'Wishlist' }],
	}),
]

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
	args: { summaries },
}

export const SinglePerson: Story = {
	args: { summaries: [summaries[0]!] },
}

export const WithPartner: Story = {
	args: { summaries: [summaries[1]!] },
}

export const Empty: Story = {
	args: { summaries: [] },
}
