import type { Meta, StoryObj } from '@storybook/react-vite'

import { makeGift, viewerUser } from './_stories/fixtures'
import { ClaimAction } from './claim-action'

/**
 * Single entry point for the viewer's claim action. Renders "Claim" for
 * a new claimer, "Edit claim" for an existing claimer, or nothing when
 * the viewer is blocked. Owns the dialog open state for both flows.
 *
 * The dashed frame in each story is a story-only wrapper so the
 * empty-render states (locked / fully-claimed-by-others) still have a
 * visible footprint - in production those branches render nothing.
 */
const meta = {
	title: 'Items/Components/ClaimAction',
	component: ClaimAction,
	parameters: { layout: 'padded' },
	decorators: [
		Story => (
			<div className="min-h-12 inline-flex items-center justify-center px-3 py-2 border border-dashed border-muted-foreground/40 rounded-md text-xs text-muted-foreground gap-2">
				<span>action:</span>
				<Story />
			</div>
		),
	],
	args: {
		itemId: 1,
		itemTitle: 'Bluetooth headphones',
		itemImageUrl: null,
		itemQuantity: 1,
		remaining: 1,
		remainingForEdit: 1,
	},
} satisfies Meta<typeof ClaimAction>

export default meta
type Story = StoryObj<typeof meta>

export const Claimable: Story = {
	args: { remaining: 1, remainingForEdit: 1 },
	parameters: { docs: { description: { story: 'qty=1, no claim yet, no lock. Renders the "Claim" button.' } } },
}

export const ClaimableMulti: Story = {
	args: { itemQuantity: 3, remaining: 2, remainingForEdit: 2 },
	parameters: { docs: { description: { story: 'qty=3 with 1 already claimed by someone else. Renders "Claim".' } } },
}

export const HasClaim: Story = {
	args: {
		itemQuantity: 3,
		remaining: 2,
		remainingForEdit: 3,
		myClaim: makeGift({ gifterId: viewerUser.id, gifter: viewerUser, quantity: 1 }),
	},
	parameters: { docs: { description: { story: 'Viewer has an existing claim. Renders "Edit claim" instead of "Claim".' } } },
}

export const HasClaimFullyClaimed: Story = {
	args: {
		itemQuantity: 1,
		remaining: 0,
		remainingForEdit: 1,
		myClaim: makeGift({ gifterId: viewerUser.id, gifter: viewerUser, quantity: 1 }),
	},
	parameters: { docs: { description: { story: 'Viewer is the only claimer on a qty=1 item. Edit-claim path stays available.' } } },
}

export const FullyClaimedByOthers: Story = {
	args: { remaining: 0, remainingForEdit: 0 },
	parameters: { docs: { description: { story: 'qty=1 fully claimed by someone else, viewer has no claim. Renders nothing.' } } },
}

export const Locked: Story = {
	args: { itemQuantity: 3, remaining: 3, remainingForEdit: 3, locked: true },
	parameters: {
		docs: {
			description: {
				story:
					'Group rule blocks the viewer (e.g. ordered group, pick-one group with sibling claimed). Renders nothing; the lock UI lives on the badge.',
			},
		},
	},
}
