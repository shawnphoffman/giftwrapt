import type { Meta, StoryObj } from '@storybook/react-vite'

import type { RecentItemRow } from '@/api/recent'

import { withPageContainer } from '../../../.storybook/decorators'
import { RecentItemsPageContent } from './recent-items-page'

const now = new Date()
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000)
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000)

function row(overrides: Partial<RecentItemRow> = {}): RecentItemRow {
	return {
		id: 1,
		title: 'Item',
		url: null,
		price: null,
		imageUrl: null,
		priority: 'normal',
		quantity: 1,
		createdAt: hoursAgo(2),
		listId: 10,
		listName: 'Birthday 2026',
		listType: 'birthday',
		listOwnerName: 'Sam Sibling',
		listOwnerEmail: 'sam@example.com',
		listOwnerImage: null,
		commentCount: 0,
		...overrides,
	}
}

const sampleItems: Array<RecentItemRow> = [
	row({
		id: 1,
		title: 'Noise-cancelling headphones',
		url: 'https://www.amazon.com/dp/B0863TXGM3',
		priority: 'very-high',
		imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400',
		commentCount: 2,
		createdAt: hoursAgo(1),
	}),
	row({
		id: 2,
		title: 'Hand-thrown ceramic mug',
		url: 'https://www.etsy.com/listing/12345/handmade-mug',
		priority: 'high',
		imageUrl: 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=400',
		commentCount: 5,
		listType: 'wishlist',
		listName: "Sam's Wish List",
		createdAt: hoursAgo(20),
	}),
	row({
		id: 3,
		title: 'Climbing chalk multipack',
		priority: 'normal',
		listType: 'christmas',
		listName: 'Christmas 2026',
		listOwnerName: 'Mom',
		listOwnerEmail: 'mom@example.com',
		createdAt: daysAgo(2),
	}),
	row({
		id: 4,
		title: 'Trail running shoes',
		priority: 'low',
		listType: 'giftideas',
		listName: 'Ideas for Alex',
		listOwnerName: 'You',
		listOwnerEmail: 'you@example.com',
		commentCount: 1,
		createdAt: daysAgo(5),
	}),
	row({
		id: 5,
		title: 'Espresso beans subscription',
		url: 'https://www.bluebottlecoffee.com/us/eng/subscriptions',
		priority: 'high',
		imageUrl: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400',
		listType: 'wishlist',
		listName: 'My Wish List',
		listOwnerName: 'You',
		listOwnerEmail: 'you@example.com',
		createdAt: daysAgo(12),
	}),
	row({
		id: 6,
		title: 'A new bike bell',
		url: null,
		priority: 'normal',
		listType: 'birthday',
		listName: 'Birthday 2026',
		createdAt: daysAgo(20),
	}),
	row({
		id: 7,
		title: 'Insanely long product title that goes on and on so we can verify truncation behaves nicely on narrow viewports',
		url: 'https://www.amazon.com/very/long/path/to/product',
		priority: 'normal',
		commentCount: 3,
		createdAt: daysAgo(28),
	}),
]

const meta = {
	title: 'Pages/Recent Items',
	component: RecentItemsPageContent,
	parameters: { layout: 'fullscreen' },
	decorators: [withPageContainer],
} satisfies Meta<typeof RecentItemsPageContent>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
	args: { items: sampleItems },
}

export const Empty: Story = {
	args: { items: [] },
}

export const SingleItem: Story = {
	args: { items: [sampleItems[0]] },
}

export const AllSameDay: Story = {
	args: {
		items: [
			row({ id: 1, title: 'Cookbook', priority: 'normal', createdAt: hoursAgo(1) }),
			row({ id: 2, title: 'Wine glasses', priority: 'low', createdAt: hoursAgo(3) }),
			row({ id: 3, title: 'Kitchen mixer', priority: 'high', createdAt: hoursAgo(5) }),
		],
	},
}
