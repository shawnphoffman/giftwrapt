import type { Meta, StoryObj } from '@storybook/react-vite'

import type { GroupSummary } from '@/api/lists'
import type { Availability, Priority } from '@/db/schema/enums'

import { withItemFrame } from './_stories/decorators'
import { makeGift, makeItemWithGifts, otherGifter, placeholderImages, viewerUser } from './_stories/fixtures'
import { ItemEditRow } from './item-edit-row'
import ItemRow from './item-row'

/**
 * Playground for a single item. Every prop is exposed as a control so you can
 * interactively compose any state. The `view` control flips between the
 * recipient (owner) view and the gifter (buyer) view. Claim state controls
 * only affect the gifter view.
 */

type View = 'recipient' | 'gifter'
type ClaimState = 'none' | 'other' | 'you' | 'partial' | 'full'

const priorities: Array<Priority> = ['low', 'normal', 'high', 'very-high']
const availabilities: Array<Availability> = ['available', 'unavailable']
const images: Record<string, string | null> = {
	none: null,
	square: placeholderImages.square,
	tall: placeholderImages.tall,
	wide: placeholderImages.wide,
	tiny: placeholderImages.tiny,
	huge: placeholderImages.huge,
}

type PlaygroundArgs = {
	view: View
	title: string
	url: string | null
	price: string | null
	quantity: number
	priority: Priority
	availability: Availability
	notes: string | null
	imageKey: keyof typeof images
	grouped: boolean
	commentCount: number
	// Buyer-view-only controls
	claimState: ClaimState
}

function Playground(args: PlaygroundArgs) {
	const imageUrl = images[args.imageKey] ?? null

	const itemBase = {
		title: args.title,
		url: args.url || null,
		price: args.price || null,
		quantity: args.quantity,
		priority: args.priority,
		availability: args.availability,
		notes: args.notes || null,
		imageUrl,
	}

	const groups: Array<GroupSummary> = [
		{ id: 10, type: 'or', name: 'Pick one', priority: 'normal', sortOrder: null },
		{ id: 11, type: 'order', name: 'Ordered', priority: 'normal', sortOrder: null },
	]

	if (args.view === 'recipient') {
		return <ItemEditRow item={makeItemWithGifts(itemBase)} commentCount={args.commentCount} groups={groups} grouped={args.grouped} />
	}

	let gifts: Array<ReturnType<typeof makeGift>> = []
	switch (args.claimState) {
		case 'none':
			gifts = []
			break
		case 'other':
			gifts = [makeGift({ gifterId: otherGifter.id, gifter: otherGifter, quantity: 1 })]
			break
		case 'you':
			gifts = [makeGift({ gifterId: viewerUser.id, gifter: viewerUser, quantity: 1 })]
			break
		case 'partial': {
			const half = Math.max(1, Math.floor(args.quantity / 2))
			gifts = [makeGift({ gifterId: otherGifter.id, gifter: otherGifter, quantity: half })]
			break
		}
		case 'full':
			gifts = [makeGift({ gifterId: otherGifter.id, gifter: otherGifter, quantity: args.quantity })]
			break
	}

	return <ItemRow item={makeItemWithGifts({ ...itemBase, gifts, commentCount: args.commentCount })} grouped={args.grouped} />
}

const meta = {
	title: 'Items/Playground',
	component: Playground,
	parameters: {
		layout: 'fullscreen',
		session: { user: viewerUser },
		docs: {
			description: {
				component:
					'Every item prop exposed as a control. Flip between recipient and gifter views to see the same item from both perspectives.',
			},
		},
	},
	decorators: [withItemFrame],
	argTypes: {
		view: { control: { type: 'radio' }, options: ['recipient', 'gifter'] },
		title: { control: 'text' },
		url: { control: 'text' },
		price: { control: 'text' },
		quantity: { control: { type: 'number', min: 1, max: 50, step: 1 } },
		priority: { control: { type: 'select' }, options: priorities },
		availability: { control: { type: 'select' }, options: availabilities },
		notes: { control: 'text' },
		imageKey: { control: { type: 'select' }, options: Object.keys(images), name: 'image' },
		grouped: { control: 'boolean', description: 'Render in the compact grouped variant.' },
		commentCount: { control: { type: 'number', min: 0, max: 99, step: 1 } },
		claimState: {
			control: { type: 'select' },
			options: ['none', 'other', 'you', 'partial', 'full'] satisfies Array<ClaimState>,
			description: 'Gifter view only. Simulates different claim states on the item.',
		},
	},
	args: {
		view: 'recipient',
		title: 'Bluetooth headphones',
		url: 'https://www.amazon.com/dp/B0863TXGM3',
		price: '349.99',
		quantity: 1,
		priority: 'normal',
		availability: 'available',
		notes: null,
		imageKey: 'none',
		grouped: false,
		commentCount: 0,
		claimState: 'none',
	},
} satisfies Meta<typeof Playground>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
