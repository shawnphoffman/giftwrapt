import type { Meta, StoryObj } from '@storybook/react-vite'

import { withGalleryFrame, withItemFrame } from '@/components/items/_stories/decorators'

import ItemOverview, { type ItemOverviewProps } from './item-overview'

const now = new Date()
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000)
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000)

const base: ItemOverviewProps = {
	id: 1,
	title: 'Hand-thrown ceramic mug',
	url: 'https://www.etsy.com/listing/12345/handmade-mug',
	priority: 'normal',
	createdAt: hoursAgo(3),
	listId: 10,
	listName: 'Birthday 2026',
	listType: 'birthday',
	listOwnerName: 'Sam Sibling',
	listOwnerEmail: 'sam@example.com',
	listOwnerImage: null,
}

const meta = {
	title: 'Items/Components/ItemOverview',
	component: ItemOverview,
	parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ItemOverview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { args: base, decorators: [withItemFrame] }

export const HighPriority: Story = {
	args: { ...base, title: 'Noise-cancelling headphones', priority: 'high', commentCount: 2 },
	decorators: [withItemFrame],
}

export const VeryHighPriority: Story = {
	args: { ...base, title: 'The one thing I really want', priority: 'very-high' },
	decorators: [withItemFrame],
}

export const LowPriority: Story = {
	args: { ...base, title: 'Maybe-someday sweater', priority: 'low', commentCount: 1 },
	decorators: [withItemFrame],
}

export const NoUrl: Story = {
	args: { ...base, title: 'Anything from the bookstore (gift card)', url: null },
	decorators: [withItemFrame],
}

export const WithImage: Story = {
	args: {
		...base,
		title: 'Hand-thrown ceramic mug',
		priority: 'high',
		imageUrl: 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=400',
	},
	decorators: [withItemFrame],
}

export const WithImageAndComments: Story = {
	args: {
		...base,
		title: 'Hand-thrown ceramic mug',
		priority: 'high',
		imageUrl: 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=400',
		commentCount: 3,
	},
	decorators: [withItemFrame],
}

export const WithOneComment: Story = {
	args: { ...base, commentCount: 1 },
	decorators: [withItemFrame],
}

export const WithComments: Story = {
	args: { ...base, priority: 'high', commentCount: 4 },
	decorators: [withItemFrame],
}

export const LongTitle: Story = {
	args: {
		...base,
		title: 'Insanely long product title that goes on and on and on so we can verify truncation behaves nicely on narrow viewports',
		url: 'https://www.amazon.com/very/long/path/to/product',
	},
	decorators: [withItemFrame],
}

export const ChristmasList: Story = {
	args: { ...base, listType: 'christmas', listName: 'Christmas 2026', listOwnerName: 'Mom', priority: 'high' },
	decorators: [withItemFrame],
}

export const GiftIdeasList: Story = {
	args: {
		...base,
		listType: 'giftideas',
		listName: 'Ideas for Alex',
		listOwnerName: 'You',
		title: 'A new bike bell',
		priority: 'normal',
	},
	decorators: [withItemFrame],
}

export const DifferentTimes: Story = {
	args: base,
	decorators: [withGalleryFrame],
	render: () => (
		<div className="flex flex-col gap-2">
			<ItemOverview {...base} id={1} title="Just now item" createdAt={hoursAgo(0.1)} />
			<ItemOverview {...base} id={2} title="3 hours ago item" createdAt={hoursAgo(3)} />
			<ItemOverview {...base} id={3} title="Yesterday item" createdAt={daysAgo(1)} />
			<ItemOverview {...base} id={4} title="A week old item" createdAt={daysAgo(7)} />
			<ItemOverview {...base} id={5} title="Almost-stale item" createdAt={daysAgo(28)} />
		</div>
	),
}

export const Stack: Story = {
	args: base,
	decorators: [withGalleryFrame],
	render: () => (
		<div className="flex flex-col gap-2">
			<ItemOverview
				{...base}
				id={1}
				title="Noise-cancelling headphones"
				priority="very-high"
				listType="birthday"
				listOwnerName="Sam Sibling"
				imageUrl="https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400"
				commentCount={2}
				createdAt={hoursAgo(2)}
			/>
			<ItemOverview
				{...base}
				id={2}
				title="Hand-thrown ceramic mug"
				priority="high"
				url="https://www.etsy.com/listing/12345"
				listType="wishlist"
				listName="Sam's Wish List"
				listOwnerName="Sam Sibling"
				imageUrl="https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=400"
				commentCount={5}
				createdAt={hoursAgo(20)}
			/>
			<ItemOverview
				{...base}
				id={3}
				title="Climbing chalk multipack"
				priority="normal"
				listType="christmas"
				listName="Christmas 2026"
				listOwnerName="Mom"
				listOwnerEmail="mom@example.com"
				createdAt={daysAgo(2)}
			/>
			<ItemOverview
				{...base}
				id={4}
				title="Trail running shoes"
				priority="low"
				url={null}
				listType="giftideas"
				listName="Ideas for Alex"
				listOwnerName="You"
				commentCount={1}
				createdAt={daysAgo(5)}
			/>
			<ItemOverview
				{...base}
				id={5}
				title="Espresso beans subscription"
				priority="high"
				listType="wishlist"
				listName="My Wish List"
				listOwnerName="You"
				imageUrl="https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400"
				createdAt={daysAgo(12)}
			/>
		</div>
	),
}
