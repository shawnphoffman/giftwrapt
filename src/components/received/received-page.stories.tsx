import type { Meta, StoryObj } from '@storybook/react-vite'

import type { GifterUnit, ReceivedAddonRow, ReceivedGiftRow, ReceivedGiftsResult } from '@/api/received'

import { withPageContainer } from '../../../.storybook/decorators'
import { ReceivedPageContent } from './received-page'

/**
 * Aggregated received-gifts page: top-gifter chart, monthly received bar
 * chart, and a collapsible per-gifter-household breakdown. Cost is
 * intentionally absent (count-only metrics).
 */

function daysAgo(n: number): Date {
	const d = new Date()
	d.setDate(d.getDate() - n)
	return d
}

const VIEWER_ID = 'viewer'

function solo(id: string, name: string, image: string | null = null): GifterUnit {
	return { key: `solo:${id}`, label: name, members: [{ id, name, image }] }
}

function pair(id1: string, name1: string, id2: string, name2: string): GifterUnit {
	const sorted = [
		{ id: id1, name: name1 },
		{ id: id2, name: name2 },
	].sort((a, b) => (a.id < b.id ? -1 : 1))
	return {
		key: `pair:${sorted[0].id}:${sorted[1].id}`,
		label: `${sorted[0].name} & ${sorted[1].name}`,
		members: sorted.map(m => ({ id: m.id, name: m.name, image: null })),
	}
}

function gift(overrides: Partial<ReceivedGiftRow>): ReceivedGiftRow {
	return {
		type: 'item',
		itemId: 1,
		itemTitle: 'Untitled',
		itemImageUrl: null,
		itemPrice: null,
		listId: 1,
		listName: 'Wishlist',
		gifterNames: [],
		gifterUnits: [],
		quantity: 1,
		archivedAt: new Date(),
		createdAt: new Date(),
		recipientKind: 'self',
		recipientId: VIEWER_ID,
		...overrides,
	}
}

function addon(overrides: Partial<ReceivedAddonRow>): ReceivedAddonRow {
	return {
		type: 'addon',
		addonId: 1,
		description: 'Side gift',
		totalCost: null,
		listId: 1,
		listName: 'Wishlist',
		gifterNames: [],
		gifterUnits: [],
		archivedAt: new Date(),
		createdAt: new Date(),
		recipientKind: 'self',
		recipientId: VIEWER_ID,
		...overrides,
	}
}

const aliceBob = pair('alice', 'Alice', 'bob', 'Bob')
const sam = solo('sam', 'Sam Sibling')
const morgan = solo('morgan', 'Morgan')
const diana = solo('diana', 'Diana') // viewer's own partner -> solo per API rule

const richSelfGifts: Array<ReceivedGiftRow> = [
	gift({
		itemId: 11,
		itemTitle: 'Bluetooth headphones',
		listId: 100,
		listName: 'Christmas 2025',
		gifterUnits: [aliceBob],
		createdAt: daysAgo(5),
		archivedAt: daysAgo(5),
	}),
	gift({
		itemId: 12,
		itemTitle: 'Hand-thrown ceramic mug',
		listId: 100,
		listName: 'Christmas 2025',
		gifterUnits: [aliceBob],
		createdAt: daysAgo(15),
		archivedAt: daysAgo(15),
	}),
	gift({
		itemId: 13,
		itemTitle: 'Wine glasses',
		quantity: 4,
		listId: 100,
		listName: 'Christmas 2025',
		gifterUnits: [sam],
		createdAt: daysAgo(45),
		archivedAt: daysAgo(45),
	}),
	gift({
		itemId: 14,
		itemTitle: 'Gardening gloves',
		listId: 200,
		listName: 'Birthday',
		gifterUnits: [morgan],
		createdAt: daysAgo(120),
		archivedAt: daysAgo(120),
	}),
	gift({
		itemId: 15,
		itemTitle: 'Smart garden starter kit',
		listId: 200,
		listName: 'Birthday',
		gifterUnits: [diana],
		createdAt: daysAgo(150),
		archivedAt: daysAgo(150),
	}),
	gift({
		itemId: 16,
		itemTitle: 'Espresso machine',
		listId: 100,
		listName: 'Christmas 2025',
		gifterUnits: [sam],
		createdAt: daysAgo(60),
		archivedAt: daysAgo(60),
	}),
]

const richSelfAddons: Array<ReceivedAddonRow> = [
	addon({
		addonId: 21,
		description: 'Handmade card',
		listId: 100,
		listName: 'Christmas 2025',
		gifterUnits: [aliceBob],
		createdAt: daysAgo(5),
		archivedAt: daysAgo(5),
	}),
	addon({
		addonId: 22,
		description: 'Bouquet of flowers',
		listId: 200,
		listName: 'Birthday',
		gifterUnits: [diana],
		createdAt: daysAgo(150),
		archivedAt: daysAgo(150),
	}),
]

const dependentGifts: Array<ReceivedGiftRow> = [
	gift({
		itemId: 31,
		itemTitle: 'Salmon treats',
		listId: 300,
		listName: 'Mochi Wishlist',
		gifterUnits: [aliceBob],
		recipientKind: 'dependent',
		recipientId: 'mochi',
		createdAt: daysAgo(20),
		archivedAt: daysAgo(20),
	}),
	gift({
		itemId: 32,
		itemTitle: 'New collar',
		listId: 300,
		listName: 'Mochi Wishlist',
		gifterUnits: [sam],
		recipientKind: 'dependent',
		recipientId: 'mochi',
		createdAt: daysAgo(50),
		archivedAt: daysAgo(50),
	}),
]

const dataMultiple: ReceivedGiftsResult = {
	gifts: richSelfGifts,
	addons: richSelfAddons,
	dependents: [
		{
			dependent: { id: 'mochi', name: 'Mochi', image: null },
			gifts: dependentGifts,
			addons: [],
		},
	],
}

const dataSelfOnly: ReceivedGiftsResult = {
	gifts: richSelfGifts,
	addons: richSelfAddons,
	dependents: [],
}

const dataSingleGifter: ReceivedGiftsResult = {
	gifts: [
		gift({ itemId: 11, itemTitle: 'Headphones', gifterUnits: [aliceBob], createdAt: daysAgo(5), archivedAt: daysAgo(5) }),
		gift({ itemId: 12, itemTitle: 'Mug', gifterUnits: [aliceBob], createdAt: daysAgo(20), archivedAt: daysAgo(20) }),
	],
	addons: [],
	dependents: [],
}

const dataPartnerSolo: ReceivedGiftsResult = {
	gifts: [
		gift({ itemId: 41, itemTitle: 'Watch', gifterUnits: [diana], createdAt: daysAgo(10), archivedAt: daysAgo(10) }),
		gift({ itemId: 42, itemTitle: 'Book', gifterUnits: [aliceBob], createdAt: daysAgo(30), archivedAt: daysAgo(30) }),
	],
	addons: [],
	dependents: [],
}

const dataEmpty: ReceivedGiftsResult = { gifts: [], addons: [], dependents: [] }

const meta = {
	title: 'Pages/Received',
	component: ReceivedPageContent,
	parameters: { layout: 'fullscreen' },
	decorators: [withPageContainer],
} satisfies Meta<typeof ReceivedPageContent>

export default meta
type Story = StoryObj<typeof meta>

export const Multiple: Story = { args: { data: dataMultiple } }
export const SelfOnly: Story = { args: { data: dataSelfOnly } }
export const SinglePairGifter: Story = { args: { data: dataSingleGifter } }
export const ViewerPartnerSolo: Story = { args: { data: dataPartnerSolo } }
export const Empty: Story = { args: { data: dataEmpty } }
