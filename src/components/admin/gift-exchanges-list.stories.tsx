import type { Meta, StoryObj } from '@storybook/react-vite'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import { GiftExchangesListView } from './gift-exchanges-list'

/**
 * The admin Exchanges list: one plain list, running exchanges first, a state
 * badge per row. Archived rows are dimmed like an archived list row.
 */
const meta = {
	title: 'Admin/Gift Exchanges/List',
	component: GiftExchangesListView,
	parameters: { layout: 'padded' },
	decorators: [
		Story => (
			<Card className="max-w-2xl">
				<CardHeader>
					<CardTitle className="text-2xl">Gift Exchanges</CardTitle>
					<CardDescription>Draw names so everyone gifts to one person.</CardDescription>
				</CardHeader>
				<CardContent>
					<Story />
				</CardContent>
			</Card>
		),
	],
} satisfies Meta<typeof GiftExchangesListView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
	args: {
		exchanges: [
			{ id: '1', name: 'Christmas 2026', budget: 50, budgetCurrency: 'USD', giftDate: '2026-12-25', state: 'not-drawn', memberCount: 8 },
			{ id: '2', name: 'Cousins Swap', budget: null, budgetCurrency: null, giftDate: '2026-12-20', state: 'drawn', memberCount: 1 },
			{ id: '3', name: 'Christmas 2025', budget: 50, budgetCurrency: 'USD', giftDate: '2025-12-25', state: 'archived', memberCount: 7 },
			{
				id: '4',
				name: 'Cousins Gift Swap at the Lake House Summer Reunion Weekend Extravaganza',
				budget: 25.5,
				budgetCurrency: 'EUR',
				giftDate: '2025-07-19',
				state: 'archived',
				memberCount: 14,
			},
		],
	},
}

export const Empty: Story = {
	args: { exchanges: [] },
}
