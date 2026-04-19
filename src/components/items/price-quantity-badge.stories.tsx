import type { Meta, StoryObj } from '@storybook/react-vite'

import { PriceQuantityBadge } from './price-quantity-badge'

/**
 * Compact pill that shows price, quantity, or both for a wish list item.
 * Renders nothing when there is no price and quantity is 1.
 */

const meta = {
	title: 'Items/PriceQuantityBadge',
	component: PriceQuantityBadge,
	parameters: { layout: 'padded' },
} satisfies Meta<typeof PriceQuantityBadge>

export default meta
type Story = StoryObj<typeof meta>

export const PriceOnly: Story = {
	args: { price: '349.99', quantity: 1 },
}

export const QuantityOnly: Story = {
	args: { price: null, quantity: 4 },
}

export const PriceAndQuantity: Story = {
	args: { price: '2.50', quantity: 3 },
}

export const Empty: Story = {
	args: { price: null, quantity: 1 },
	parameters: {
		docs: { description: { story: 'No price and quantity of 1: renders nothing.' } },
	},
}
