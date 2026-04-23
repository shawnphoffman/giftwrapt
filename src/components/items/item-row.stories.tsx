import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'

import { withItemFrame } from './_stories/decorators'
import { makeGift, makeItemWithGifts, placeholderImages, thirdGifter, viewerUser } from './_stories/fixtures'
import ItemRow from './item-row'

/**
 * Gift buyer's view of a list item, what someone looking at a friend or
 * family member's wish list sees. This is where claims live: buyers can
 * claim a slot, see who else has claimed, and edit/unclaim their own claim.
 */

const meta = {
	title: 'Items/ItemRow (buyer view)',
	component: ItemRow,
	parameters: {
		layout: 'fullscreen',
		// Default: viewer is signed in as themselves. Individual stories can
		// override with `session: null` to see the signed-out experience.
		session: { user: viewerUser },
	},
	decorators: [withItemFrame],
} satisfies Meta<typeof ItemRow>

export default meta
type Story = StoryObj<typeof meta>

export const Unclaimed: Story = {
	args: {
		item: makeItemWithGifts(),
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await expect(canvas.getByRole('button', { name: /claim/i })).toBeInTheDocument()
	},
}

export const WithNotesAndImage: Story = {
	args: {
		item: makeItemWithGifts({
			title: 'Hand-thrown ceramic mug',
			url: 'https://www.etsy.com/listing/12345/handmade-mug',
			imageUrl: placeholderImages.square,
			notes: 'Any neutral color works, **cream, sage, or stone** preferred over bright glazes.',
			price: '42',
			priority: 'high',
		}),
	},
}

export const ClaimedByAnother: Story = {
	args: {
		item: makeItemWithGifts({
			gifts: [makeGift()],
		}),
	},
}

export const ClaimedByYou: Story = {
	args: {
		item: makeItemWithGifts({
			gifts: [
				makeGift({
					gifterId: viewerUser.id,
					gifter: viewerUser,
				}),
			],
		}),
	},
}

export const PartiallyClaimedMultipleGifters: Story = {
	args: {
		item: makeItemWithGifts({
			title: 'Wine glasses',
			quantity: 6,
			price: '12 each',
			gifts: [makeGift({ quantity: 2 }), makeGift({ quantity: 2, gifterId: thirdGifter.id, gifter: thirdGifter })],
		}),
	},
}

export const FullyClaimedByOthers: Story = {
	args: {
		item: makeItemWithGifts({
			title: 'Espresso machine',
			price: '699',
			priority: 'very-high',
			gifts: [makeGift({ quantity: 1 })],
		}),
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await expect(canvas.getByText(/fully claimed/i)).toBeInTheDocument()
		await expect(canvas.queryByRole('button', { name: /^claim$/i })).not.toBeInTheDocument()
	},
}

export const ClaimDialogOpens: Story = {
	args: {
		item: makeItemWithGifts({ title: 'Open the claim dialog' }),
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const button = canvas.getByRole('button', { name: /claim/i })
		await userEvent.click(button)
		// Dialog renders in a portal, so query from the document body.
		await expect(await within(document.body).findByRole('dialog')).toBeInTheDocument()
	},
	tags: ['!autodocs'],
}

export const SignedOutVisitor: Story = {
	args: {
		item: makeItemWithGifts({
			gifts: [makeGift()],
		}),
	},
	parameters: {
		session: null,
	},
}

export const GroupedRow: Story = {
	args: {
		item: makeItemWithGifts({ title: 'Item rendered as part of a group' }),
		grouped: true,
	},
	parameters: {
		docs: { description: { story: 'Compact variant used when the row sits inside a GroupBlock (no outer card or priority tab).' } },
	},
}
