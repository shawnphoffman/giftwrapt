import type { Meta, StoryObj } from '@storybook/react-vite'

import { withGalleryFrame, withItemFrame } from '@/components/items/_stories/decorators'

import ItemConversation, { type ItemConversationProps } from './item-conversation'

const now = new Date()
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60 * 1000)
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000)
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000)

const alex = { name: 'Alex', email: 'alex@example.com', image: null }
const mom = { name: 'Mom', email: 'mom@example.com', image: null }
const dad = { name: 'Dad', email: 'dad@example.com', image: null }
const auntJo = { name: 'Aunt Jo', email: 'jo@example.com', image: null }

const base: ItemConversationProps = {
	id: 1,
	title: 'Hand-thrown ceramic mug',
	url: 'https://www.etsy.com/listing/12345/handmade-mug',
	priority: 'normal',
	createdAt: daysAgo(4),
	listId: 10,
	listName: 'Birthday 2026',
	listType: 'birthday',
	listOwnerName: 'Sam Sibling',
	listOwnerEmail: 'sam@example.com',
	listOwnerImage: null,
	comments: [
		{ id: 1, comment: 'The cream glaze is the one to get, not the bright ones.', createdAt: hoursAgo(3), user: alex },
		{
			id: 2,
			comment: 'I think Aunt Jo already grabbed this last weekend, double-check before claiming.',
			createdAt: hoursAgo(8),
			user: mom,
		},
		{ id: 3, comment: 'Do you know if the seller ships to Canada?', createdAt: daysAgo(1), user: dad },
	],
	commentCount: 3,
}

const meta = {
	title: 'Items/Components/ItemConversation',
	component: ItemConversation,
	parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ItemConversation>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { args: base, decorators: [withItemFrame] }

export const SingleComment: Story = {
	args: {
		...base,
		comments: [{ id: 1, comment: 'Love this color!', createdAt: minutesAgo(20), user: alex }],
		commentCount: 1,
	},
	decorators: [withItemFrame],
}

export const TwoComments: Story = {
	args: {
		...base,
		comments: base.comments.slice(0, 2),
		commentCount: 2,
	},
	decorators: [withItemFrame],
}

export const HighPriority: Story = {
	args: {
		...base,
		title: 'Noise-cancelling headphones',
		priority: 'high',
	},
	decorators: [withItemFrame],
}

export const VeryHighPriorityWithImage: Story = {
	args: {
		...base,
		title: 'The one thing I really want',
		priority: 'very-high',
		imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400',
	},
	decorators: [withItemFrame],
}

export const WithImage: Story = {
	args: {
		...base,
		priority: 'high',
		imageUrl: 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=400',
	},
	decorators: [withItemFrame],
}

export const HotThread: Story = {
	args: {
		...base,
		title: 'Trail running shoes',
		priority: 'high',
		imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400',
		comments: [
			{ id: 1, comment: 'These are on sale at REI right now, FYI.', createdAt: minutesAgo(15), user: alex },
			{ id: 2, comment: "What's your size again?", createdAt: minutesAgo(45), user: mom },
			{ id: 3, comment: '11 wide', createdAt: hoursAgo(1), user: alex },
			{ id: 4, comment: 'Got them last week, did the wide fit work for you?', createdAt: hoursAgo(2), user: auntJo },
			{ id: 5, comment: 'These run small, size up.', createdAt: hoursAgo(4), user: dad },
			{ id: 6, comment: 'I can grab a pair if no one else has yet.', createdAt: hoursAgo(7), user: mom },
		],
		commentCount: 6,
	},
	decorators: [withItemFrame],
}

export const TruncatedThread: Story = {
	args: {
		...base,
		title: 'Espresso beans subscription',
		priority: 'low',
		imageUrl: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400',
		comments: [
			{ id: 1, comment: 'Roastery runs out fast, get the 2lb option.', createdAt: minutesAgo(30), user: alex },
			{ id: 2, comment: 'Do they ship internationally?', createdAt: hoursAgo(1), user: mom },
			{ id: 3, comment: 'Yeah, but it doubles the price.', createdAt: hoursAgo(2), user: dad },
		],
		commentCount: 14,
	},
	parameters: {
		docs: {
			description: {
				story: 'Shows the "N earlier comments" link when only the most recent slice is rendered out of a longer thread.',
			},
		},
	},
	decorators: [withItemFrame],
}

export const LongComment: Story = {
	args: {
		...base,
		comments: [
			{
				id: 1,
				comment:
					'A few thoughts on this one:\n\n- The cream glaze is the one to get, not the bright glazes\n- Etsy seller is great, ships fast, very protective packaging\n- Last time we ordered a mug from her it took ~3 weeks though, so plan ahead if it is a gift\n- This particular mug seems to be one-of-a-kind which might explain the price',
				createdAt: hoursAgo(3),
				user: dad,
			},
		],
		commentCount: 1,
	},
	decorators: [withItemFrame],
}

export const NoUrl: Story = {
	args: {
		...base,
		title: 'Anything from the bookstore (gift card)',
		url: null,
	},
	decorators: [withItemFrame],
}

export const Stack: Story = {
	args: base,
	decorators: [withGalleryFrame],
	render: () => (
		<div className="flex flex-col gap-2">
			<ItemConversation
				{...base}
				id={1}
				title="Noise-cancelling headphones"
				priority="very-high"
				imageUrl="https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400"
				comments={[
					{ id: 1, comment: 'Sony WH-1000XM5 are the best ones to get.', createdAt: minutesAgo(20), user: dad },
					{ id: 2, comment: 'Agreed, the noise cancelling is wild.', createdAt: hoursAgo(2), user: mom },
				]}
				commentCount={2}
				createdAt={hoursAgo(2)}
			/>
			<ItemConversation
				{...base}
				id={2}
				title="Trail running shoes"
				priority="high"
				imageUrl="https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400"
				comments={[
					{ id: 1, comment: 'These run small, size up.', createdAt: minutesAgo(15), user: alex },
					{ id: 2, comment: "What's your size again?", createdAt: minutesAgo(45), user: mom },
					{ id: 3, comment: '11 wide', createdAt: hoursAgo(1), user: alex },
					{ id: 4, comment: 'I can grab a pair if no one else has yet.', createdAt: hoursAgo(2), user: auntJo },
				]}
				commentCount={9}
				createdAt={hoursAgo(20)}
			/>
			<ItemConversation
				{...base}
				id={3}
				title="Hand-thrown ceramic mug"
				priority="normal"
				comments={base.comments.slice(0, 2)}
				commentCount={2}
				createdAt={daysAgo(2)}
			/>
			<ItemConversation
				{...base}
				id={4}
				title="Espresso beans subscription"
				priority="low"
				imageUrl="https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400"
				listType="wishlist"
				listName="My Wish List"
				listOwnerName="You"
				comments={[{ id: 1, comment: 'Roastery runs out fast, get the 2lb option.', createdAt: hoursAgo(3), user: alex }]}
				commentCount={1}
				createdAt={daysAgo(5)}
			/>
		</div>
	),
}
