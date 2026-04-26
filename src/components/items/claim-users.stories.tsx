import type { Meta, StoryObj } from '@storybook/react-vite'

import { ClaimUsers } from './claim-users'

/**
 * Stacked-avatar cluster of users who have claims on a wish list item.
 *
 * Renders nothing when there are no claims. Hovering any avatar in the
 * stack opens a tooltip listing each claimer with the quantity they
 * claimed (the `× qty` suffix is hidden when qty is 1).
 */
const meta = {
	title: 'Items/Components/ClaimUsers',
	component: ClaimUsers,
	parameters: { layout: 'padded' },
} satisfies Meta<typeof ClaimUsers>

export default meta
type Story = StoryObj<typeof meta>

const SAMPLE_USERS = [
	{ id: 'u1', name: 'Avery Chen', image: null },
	{ id: 'u2', name: 'Bryn Patel', image: null },
	{ id: 'u3', name: 'Casey Morgan', image: null },
	{ id: 'u4', name: 'Devon Reyes', image: null },
	{ id: 'u5', name: 'Eli Sato', image: null },
] as const

export const None: Story = {
	args: { claims: [] },
	parameters: { docs: { description: { story: 'No claims. Renders nothing.' } } },
}

export const SingleClaimSingleQty: Story = {
	args: { claims: [{ user: SAMPLE_USERS[0], quantity: 1 }] },
	parameters: { docs: { description: { story: 'One claimer, qty 1. Tooltip shows just the name.' } } },
}

export const SingleClaimMultiQty: Story = {
	args: { claims: [{ user: SAMPLE_USERS[0], quantity: 3 }] },
	parameters: { docs: { description: { story: 'One claimer covering multiple slots. Tooltip surfaces the × qty.' } } },
}

export const TwoClaims: Story = {
	args: {
		claims: [
			{ user: SAMPLE_USERS[0], quantity: 1 },
			{ user: SAMPLE_USERS[1], quantity: 2 },
		],
	},
}

export const FiveClaims: Story = {
	args: {
		claims: [
			{ user: SAMPLE_USERS[0], quantity: 1 },
			{ user: SAMPLE_USERS[1], quantity: 2 },
			{ user: SAMPLE_USERS[2], quantity: 1 },
			{ user: SAMPLE_USERS[3], quantity: 3 },
			{ user: SAMPLE_USERS[4], quantity: 1 },
		],
	},
}

export const Playground: Story = {
	args: {
		claims: [
			{ user: SAMPLE_USERS[0], quantity: 1 },
			{ user: SAMPLE_USERS[1], quantity: 2 },
			{ user: SAMPLE_USERS[2], quantity: 1 },
		],
	},
}
