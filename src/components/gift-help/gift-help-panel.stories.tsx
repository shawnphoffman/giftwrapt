import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import type { PickItem } from '@/lib/gift-picks'

import { GiftHelpPanelView } from './gift-help-panel'

const pickItem = (id: number, title: string, price: string | null, priority: PickItem['priority'] = 'normal'): PickItem => ({
	id,
	title,
	price,
	currency: 'USD',
	priority,
	quantity: 1,
	claimedQuantity: 0,
	availability: 'available',
	groupId: null,
	groupSortOrder: null,
	url: null,
	imageUrl: null,
})

const suggestions = [
	{
		title: 'Wool Hiking Socks',
		reason: 'The list has a scarf and gloves, so warm outdoor layers look welcome.',
		priceBand: 'under-25' as const,
		searchUrl: 'https://www.google.com/search?q=Wool%20Hiking%20Socks',
	},
	{
		title: 'Insulated Travel Mug',
		reason: 'Several items are for walks and day trips.',
		priceBand: '25-50' as const,
		searchUrl: 'https://www.google.com/search?q=Insulated%20Travel%20Mug',
	},
	{
		title: 'Pocket Field Guide to Local Birds',
		reason: 'They asked for a trail map and binoculars.',
		priceBand: 'unknown' as const,
		searchUrl: 'https://www.google.com/search?q=Pocket%20Field%20Guide',
	},
]

/**
 * The "Help Me Choose" panel a gifter sees on someone else's list. Pick
 * for Me ranks what is still open and needs no AI. Need Ideas? only
 * appears when the admin has turned gift suggestions on, and never for a
 * child account.
 */
const meta = {
	title: 'Gift Help/GiftHelpPanel',
	component: GiftHelpPanelView,
	parameters: { layout: 'padded' },
	args: {
		recipientName: 'Sam',
		interests: [],
		budget: '',
		onBudgetChange: fn(),
		picks: null,
		onPick: fn(),
		suggestionsAvailable: true,
		suggestions: { phase: 'idle' },
		onAskIdeas: fn(),
		savedTitles: new Set<string>(),
		savingTitle: null,
		onSaveIdea: fn(),
	},
	decorators: [
		Story => (
			<div className="max-w-2xl">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof GiftHelpPanelView>

export default meta
type Story = StoryObj<typeof meta>

export const Idle: Story = {}

export const WithInterests: Story = {
	args: {
		interests: [
			{ category: 'sports-outdoors', count: 6 },
			{ category: 'clothing', count: 4 },
			{ category: 'books-media', count: 2 },
		],
	},
}

export const SuggestionsOff: Story = {
	args: { suggestionsAvailable: false },
	parameters: { docs: { description: { story: 'Gift suggestions turned off, or a child account: only Pick for Me is offered.' } } },
}

export const Picks: Story = {
	args: {
		budget: '50',
		picks: [
			{ item: pickItem(1, 'Merino Scarf', '$45', 'high'), reasons: ['High priority', 'Within budget', 'Nobody has claimed it'] },
			{ item: pickItem(2, 'Trail Map Poster', '$28'), reasons: ['Within budget', 'Nobody has claimed it'] },
			{ item: { ...pickItem(3, 'Enamel Mugs', null), quantity: 4, claimedQuantity: 1 }, reasons: ['No price listed', '3 of 4 left'] },
		],
	},
}

export const NothingOpen: Story = { args: { budget: '10', picks: [] } }

export const Thinking: Story = { args: { suggestions: { phase: 'loading' } } }

export const Ideas: Story = {
	args: { suggestions: { phase: 'done', suggestions }, savedTitles: new Set(['Insulated Travel Mug']) },
}

export const IdeasFailed: Story = {
	args: { suggestions: { phase: 'error', message: 'Gift suggestions are paused for this month. Try Pick for Me instead.' } },
}
