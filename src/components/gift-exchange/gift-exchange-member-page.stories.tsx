import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

import type { MyChildExchange, MyExchange, MyExchangeRecipient, MyExchangesPayload } from '@/api/_my-gift-exchanges-impl'

import { GiftExchangeMemberPage } from './gift-exchange-member-page'

// ===============================
// Fixtures
// ===============================

const ALEXANDRA: MyExchangeRecipient = {
	id: 'alexandra',
	name: 'Alexandra Montgomery-Fitzgerald',
	email: 'alexandra@example.com',
	image: null,
	birthMonth: 'march',
	birthDay: 14,
	partnerId: null,
	lastGiftedAt: null,
	lists: [
		{
			id: 11,
			name: 'Christmas 2026',
			type: 'christmas',
			description: null,
			isPrimary: false,
			createdAt: '2026-10-01T00:00:00Z',
			updatedAt: '2026-10-01T00:00:00Z',
			itemsTotal: 9,
			itemsRemaining: 6,
			holidayDate: null,
		},
		{
			id: 12,
			name: 'Everyday Wish List',
			type: 'wishlist',
			description: null,
			isPrimary: true,
			createdAt: '2026-01-01T00:00:00Z',
			updatedAt: '2026-01-01T00:00:00Z',
			itemsTotal: 14,
			itemsRemaining: 11,
			holidayDate: null,
		},
		{
			id: 13,
			name: 'Turning 40 (Kitchen, Garden and a Few Things I Keep Forgetting to Buy)',
			type: 'birthday',
			description: null,
			isPrimary: false,
			createdAt: '2026-01-01T00:00:00Z',
			updatedAt: '2026-01-01T00:00:00Z',
			itemsTotal: 6,
			itemsRemaining: 6,
			holidayDate: null,
		},
	],
}

const BEN: MyExchangeRecipient = {
	id: 'ben',
	name: 'Ben Whitfield',
	email: 'ben@example.com',
	image: null,
	birthMonth: null,
	birthDay: null,
	partnerId: null,
	lastGiftedAt: null,
	lists: [
		{
			id: 21,
			name: 'Wish List',
			type: 'wishlist',
			description: null,
			isPrimary: true,
			createdAt: '2026-01-01T00:00:00Z',
			updatedAt: '2026-01-01T00:00:00Z',
			itemsTotal: 12,
			itemsRemaining: 9,
			holidayDate: null,
		},
	],
}

const CHRISTMAS: MyExchange = {
	id: 'christmas',
	name: 'Christmas 2026',
	budget: 50,
	budgetCurrency: 'USD',
	giftDate: '2026-12-25',
	state: 'ready',
	recipient: null,
}

const OFFICE: MyExchange = {
	id: 'office',
	name: 'Office Party',
	budget: null,
	budgetCurrency: null,
	giftDate: '2026-12-18',
	state: 'ready',
	recipient: null,
}

const CHILDREN: Array<MyChildExchange> = [
	{
		exchangeId: 'christmas',
		exchangeName: 'Christmas 2026',
		child: { id: 'maya', name: 'Maya Whitfield', email: 'maya@example.com', image: null },
	},
	{
		exchangeId: 'christmas',
		exchangeName: 'Christmas 2026',
		child: { id: 'theo', name: 'Theo Whitfield', email: 'theo@example.com', image: null },
	},
]

const RECIPIENTS: Record<string, MyExchangeRecipient> = { christmas: ALEXANDRA, office: BEN }

// ===============================
// A page that behaves: See Who You Have shows the person, Show names who the child gifts to.
// ===============================

function Demo({ initial }: { initial: MyExchangesPayload }) {
	const [data, setData] = useState(initial)
	return (
		<GiftExchangeMemberPage
			data={data}
			onReveal={async exchangeId => {
				await new Promise(resolve => setTimeout(resolve, 300))
				setData(d => ({
					...d,
					exchanges: d.exchanges.map(x => (x.id === exchangeId ? { ...x, state: 'seen', recipient: RECIPIENTS[x.id] ?? BEN } : x)),
				}))
			}}
			onRevealChild={async () => {
				await new Promise(resolve => setTimeout(resolve, 300))
				return { id: 'omar', name: 'Omar Haddad', email: 'omar@example.com', image: null }
			}}
		/>
	)
}

/**
 * Everyone's Gift Exchange page. One block per exchange: the exchange card,
 * then See Who You Have until the person looks, then the same person card
 * All Lists uses. Guardians get a Children card with Show per child, a
 * confirmation, and then the name. Loading the page never counts as looking.
 */
const meta = {
	title: 'Gift Exchange/Gift Exchange Page',
	component: Demo,
	parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Demo>

export default meta
type Story = StoryObj<typeof meta>

export const NotOpenedYet: Story = {
	args: { initial: { exchanges: [CHRISTMAS], children: [] } },
}

export const Opened: Story = {
	args: { initial: { exchanges: [{ ...CHRISTMAS, state: 'seen', recipient: ALEXANDRA }], children: [] } },
}

/** They can see none of the person's lists: the All Lists "No lists" line. */
export const NoListsShared: Story = {
	args: { initial: { exchanges: [{ ...CHRISTMAS, state: 'seen', recipient: { ...ALEXANDRA, lists: [] } }], children: [] } },
}

/** A redraw, removal or late add replaced their assignment; the name is withheld until they look again. */
export const Changed: Story = {
	args: { initial: { exchanges: [{ ...CHRISTMAS, state: 'changed' }], children: [] } },
}

/** Two exchanges at once: one card and one person each. */
export const TwoExchanges: Story = {
	args: { initial: { exchanges: [OFFICE, { ...CHRISTMAS, state: 'seen', recipient: ALEXANDRA }], children: [] } },
}

export const GuardianWithChildren: Story = {
	args: { initial: { exchanges: [CHRISTMAS], children: CHILDREN } },
}

/** A guardian who isn't in any exchange still sees their children's. */
export const GuardianOnly: Story = {
	args: { initial: { exchanges: [], children: CHILDREN } },
}

/** Nothing to show. The sidebar has no link here; this is what a typed URL lands on. */
export const Empty: Story = {
	args: { initial: { exchanges: [], children: [] } },
}
