import type { Meta, StoryObj } from '@storybook/react-vite'

import type { RecentConversationComment, RecentConversationRow } from '@/api/recent'

import { withPageContainer } from '../../../.storybook/decorators'
import { RecentCommentsPageContent } from './recent-comments-page'

const now = new Date()
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60 * 1000)
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000)
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000)

const alex = { id: 'u-alex', name: 'Alex', email: 'alex@example.com', image: null }
const mom = { id: 'u-mom', name: 'Mom', email: 'mom@example.com', image: null }
const dad = { id: 'u-dad', name: 'Dad', email: 'dad@example.com', image: null }
const auntJo = { id: 'u-jo', name: 'Aunt Jo', email: 'jo@example.com', image: null }

function comment(
	overrides: Partial<RecentConversationComment> & Pick<RecentConversationComment, 'id' | 'comment' | 'createdAt' | 'user'>
): RecentConversationComment {
	return overrides
}

function row(overrides: Partial<RecentConversationRow> = {}): RecentConversationRow {
	return {
		id: 1,
		title: 'Item',
		url: null,
		priority: 'normal',
		imageUrl: null,
		createdAt: daysAgo(4),
		listId: 10,
		listName: 'Birthday 2026',
		listType: 'birthday',
		listOwnerName: 'Sam Sibling',
		listOwnerEmail: 'sam@example.com',
		listOwnerImage: null,
		subjectDependentId: null,
		subjectDependentName: null,
		subjectDependentImage: null,
		comments: [],
		commentCount: 0,
		...overrides,
	}
}

const sampleRows: Array<RecentConversationRow> = [
	row({
		id: 1,
		title: 'Noise-cancelling headphones',
		url: 'https://www.amazon.com/dp/B0863TXGM3',
		priority: 'very-high',
		imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400',
		comments: [
			comment({ id: 1, comment: 'Sony WH-1000XM5 are the best ones to get.', createdAt: minutesAgo(20), user: dad }),
			comment({ id: 2, comment: 'Agreed, the noise cancelling is wild.', createdAt: hoursAgo(2), user: mom }),
		],
		commentCount: 2,
		createdAt: hoursAgo(2),
	}),
	row({
		id: 2,
		title: 'Trail running shoes',
		url: 'https://www.rei.com/product/12345/trail-runners',
		priority: 'high',
		imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400',
		comments: [
			comment({ id: 3, comment: 'These are on sale at REI right now, FYI.', createdAt: minutesAgo(15), user: alex }),
			comment({ id: 4, comment: "What's your size again?", createdAt: minutesAgo(45), user: mom }),
			comment({ id: 5, comment: '11 wide', createdAt: hoursAgo(1), user: alex }),
			comment({ id: 6, comment: 'Got them last week, did the wide fit work for you?', createdAt: hoursAgo(2), user: auntJo }),
			comment({ id: 7, comment: 'These run small, size up.', createdAt: hoursAgo(4), user: dad }),
			comment({ id: 8, comment: 'I can grab a pair if no one else has yet.', createdAt: hoursAgo(7), user: mom }),
		],
		commentCount: 9,
		createdAt: hoursAgo(20),
	}),
	row({
		id: 3,
		title: 'Hand-thrown ceramic mug',
		url: 'https://www.etsy.com/listing/12345/handmade-mug',
		priority: 'normal',
		comments: [
			comment({ id: 9, comment: 'Cream glaze, not the bright ones.', createdAt: hoursAgo(3), user: alex }),
			comment({ id: 10, comment: 'I think Aunt Jo already grabbed this.', createdAt: hoursAgo(8), user: mom }),
		],
		commentCount: 2,
		createdAt: daysAgo(2),
	}),
	row({
		id: 4,
		title: 'Espresso beans subscription',
		priority: 'low',
		imageUrl: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400',
		listType: 'wishlist',
		listName: 'My Wish List',
		listOwnerName: 'You',
		listOwnerEmail: 'you@example.com',
		comments: [comment({ id: 11, comment: 'Roastery runs out fast, get the 2lb option.', createdAt: hoursAgo(3), user: alex })],
		commentCount: 1,
		createdAt: daysAgo(5),
	}),
]

const meta = {
	title: 'Pages/Recent Comments',
	component: RecentCommentsPageContent,
	parameters: { layout: 'fullscreen' },
	decorators: [withPageContainer],
} satisfies Meta<typeof RecentCommentsPageContent>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
	args: { rows: sampleRows },
}

export const Empty: Story = {
	args: { rows: [] },
}

export const SingleThread: Story = {
	args: { rows: [sampleRows[0]] },
}

export const TruncatedThread: Story = {
	args: {
		rows: [
			row({
				id: 1,
				title: 'Espresso beans subscription',
				priority: 'low',
				imageUrl: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400',
				comments: [
					comment({ id: 1, comment: 'Roastery runs out fast, get the 2lb option.', createdAt: minutesAgo(30), user: alex }),
					comment({ id: 2, comment: 'Do they ship internationally?', createdAt: hoursAgo(1), user: mom }),
					comment({ id: 3, comment: 'Yeah, but it doubles the price.', createdAt: hoursAgo(2), user: dad }),
				],
				commentCount: 14,
				createdAt: hoursAgo(2),
			}),
		],
	},
}
