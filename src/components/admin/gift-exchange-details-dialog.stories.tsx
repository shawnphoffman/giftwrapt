import type { Meta, StoryObj } from '@storybook/react-vite'

import { withExchangeQueries } from './_stories/gift-exchange-fixtures'
import { GiftExchangeDetailsDialog } from './gift-exchange-details-dialog'

/** Add Exchange (name, budget, gift date, people) and Edit (the same without people). */
const meta = {
	title: 'Admin/Gift Exchanges/Details Dialog',
	component: GiftExchangeDetailsDialog,
	parameters: { layout: 'centered' },
	decorators: [withExchangeQueries],
} satisfies Meta<typeof GiftExchangeDetailsDialog>

export default meta
type Story = StoryObj<typeof meta>

export const AddExchange: Story = {
	args: { open: true, onOpenChange: () => {} },
}

export const EditExchange: Story = {
	args: {
		open: true,
		onOpenChange: () => {},
		exchange: { id: 'ex-1', name: 'Christmas 2026', budget: 50, giftDate: '2026-12-25' },
	},
}
