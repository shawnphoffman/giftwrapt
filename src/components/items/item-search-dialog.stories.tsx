import type { Meta, StoryObj } from '@storybook/react-vite'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { __setStorybookMyItemSearchRows } from '../../../.storybook/mocks/api'
import { ItemSearchDialog } from './item-search-dialog'

type Row = {
	itemId: number
	title: string
	notes: string | null
	url: string | null
	imageUrl: string | null
	price: string | null
	currency: string | null
	listId: number
	listName: string
	listType: string
	listIsPrivate: boolean
}

const makeRow = (itemId: number, title: string, listId: number, listName: string, listType: string, extra: Partial<Row> = {}): Row => ({
	itemId,
	title,
	notes: null,
	url: null,
	imageUrl: null,
	price: null,
	currency: 'USD',
	listId,
	listName,
	listType,
	listIsPrivate: false,
	...extra,
})

const sampleRows: Array<Row> = [
	makeRow(1, 'Fender Hama Okamoto Katana Bass', 10, 'Shawn Won The Lottery', 'wishlist', { price: '1300' }),
	makeRow(2, 'Guild Starfire Bass II - Natural', 10, 'Shawn Won The Lottery', 'wishlist', { price: '500' }),
	makeRow(3, 'Mark Hoppus Bass Guitar Pin', 10, 'Shawn Won The Lottery', 'wishlist', { price: '$10' }),
	makeRow(4, 'Giant light up ice cream cone', 10, 'Shawn Won The Lottery', 'wishlist'),
	makeRow(5, 'Cast iron skillet', 11, 'Kitchen upgrades', 'birthday', { notes: 'the 12 inch one, not the little bass-sized one' }),
	makeRow(6, 'Espresso grinder', 11, 'Kitchen upgrades', 'birthday', { price: '$220' }),
	makeRow(7, 'Wool socks', 12, 'Christmas 2026', 'christmas', { price: '$18' }),
]

// A stress dataset. The pre-fix dialog fetched every item the viewer owned,
// mounted a row for each, and let cmdk score the whole set on every keystroke -
// which is what made typing lag. Matching now happens server-side (the mock
// mirrors it) and only the capped head is rendered, so a broad query here
// should stay responsive and show the "closest N of M" footer.
const manyRows: Array<Row> = Array.from({ length: 1200 }, (_, i) =>
	makeRow(1000 + i, `${i % 3 === 0 ? 'Bass' : 'Gadget'} number ${i}`, 20 + (i % 8), `Big list ${20 + (i % 8)}`, 'wishlist', {
		notes: i % 5 === 0 ? 'has a note mentioning guitar strings' : null,
		price: `$${(i % 90) + 10}`,
	})
)

function DialogHarness({ rows }: { rows: Array<Row> }) {
	const [open, setOpen] = useState(true)
	const [ready, setReady] = useState(false)
	const queryClient = useQueryClient()

	// Seed the mock and drop any result cached by a previously-rendered story
	// (the Storybook preview shares one QueryClient) BEFORE the dialog mounts -
	// its query fires on mount and caches for 30s.
	useEffect(() => {
		setReady(false)
		__setStorybookMyItemSearchRows(rows)
		void queryClient.resetQueries({ queryKey: ['my-item-search'] })
		setReady(true)
		return () => __setStorybookMyItemSearchRows([])
	}, [rows, queryClient])

	if (!ready) return null

	return <ItemSearchDialog open={open} onOpenChange={setOpen} />
}

const meta = {
	title: 'Items/ItemSearchDialog',
	component: DialogHarness,
	parameters: {
		layout: 'centered',
		session: {
			user: { id: 'user-1', name: 'Pat Example', email: 'pat@example.com', image: null, isChild: false, partnerId: null, role: 'user' },
		},
	},
} satisfies Meta<typeof DialogHarness>

export default meta
type Story = StoryObj<typeof meta>

// Opens on the "type at least 3 characters" prompt. Nothing is requested or
// rendered until the query clears the minimum, so opening the dialog costs
// nothing.
export const Default: Story = {
	args: { rows: sampleRows },
}

// The owner has no items on any list they own. Distinct from "no matches": the
// server reports `hasAnyItems: false` so the dialog can say so explicitly
// instead of implying the search came up short.
export const NoItems: Story = {
	args: { rows: [] },
}

// 1200 items. Typing should stay smooth, and a broad query ("bass") shows the
// capped head plus the "showing the closest N of M" footer.
export const LargeDataset: Story = {
	args: { rows: manyRows },
}
