import type { Decorator, Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, within } from 'storybook/test'

import { ListOrphanAlert } from './list-orphan-alert'

// Local copy of the OrphanedClaimRow wire shape. Importing from
// `@/api/orphan-claims` would pull the server-fn module's static import
// chain (db -> drizzle -> pg) into the storybook bundle. Same convention
// as `src/components/admin/dependents-list.stories.tsx`.
type OrphanedClaimRow = {
	giftId: number
	itemId: number
	itemTitle: string
	itemUrl: string | null
	itemImageUrl: string | null
	itemPrice: string | null
	itemCurrency: string | null
	quantity: number
	totalCost: string | null
	notes: string | null
	isPartnerPurchase: boolean
	pendingDeletionAt: Date
}

// `ListOrphanAlert` reads `getOrphanedClaimsForList` via React Query.
// Stories prime a fresh QueryClient with the rows we want to render so
// the alert mounts deterministically without hitting the server.

const FIXED_DATE = new Date('2026-05-13T12:00:00Z')

function makeRow(overrides: Partial<OrphanedClaimRow> = {}): OrphanedClaimRow {
	return {
		giftId: 1,
		itemId: 100,
		itemTitle: 'Vintage espresso machine',
		itemUrl: 'https://example.com/espresso',
		itemImageUrl: 'https://placehold.co/120x120',
		itemPrice: '249.00',
		itemCurrency: 'USD',
		quantity: 1,
		totalCost: '249.00',
		notes: null,
		isPartnerPurchase: false,
		pendingDeletionAt: FIXED_DATE,
		...overrides,
	}
}

function withRows(listId: number, rows: Array<OrphanedClaimRow>): Decorator {
	return Story => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
		client.setQueryData(['orphan-claims', 'list', listId], rows)
		return (
			<QueryClientProvider client={client}>
				<div className="max-w-3xl">
					<Story />
				</div>
			</QueryClientProvider>
		)
	}
}

const meta = {
	title: 'OrphanClaims/ListOrphanAlert',
	component: ListOrphanAlert,
	parameters: { layout: 'padded' },
	args: { listId: 1 },
} satisfies Meta<typeof ListOrphanAlert>

export default meta
type Story = StoryObj<typeof meta>

export const SingleOrphan: Story = {
	decorators: [withRows(1, [makeRow()])],
	parameters: {
		docs: {
			description: { story: 'One orphan from the recipient: the gifter sees the alert and can acknowledge.' },
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await expect(canvas.getByRole('alert')).toBeInTheDocument()
		await expect(canvas.getByText(/Vintage espresso machine/i)).toBeInTheDocument()
		await expect(canvas.getByRole('button', { name: /acknowledge/i })).toBeInTheDocument()
	},
}

export const MultipleOrphans: Story = {
	decorators: [
		withRows(1, [
			makeRow({ giftId: 1, itemId: 100, itemTitle: 'Vintage espresso machine', totalCost: '249.00' }),
			makeRow({
				giftId: 2,
				itemId: 101,
				itemTitle: 'Wireless headphones (over-ear, noise cancelling)',
				totalCost: '349.00',
				quantity: 2,
				itemImageUrl: null,
			}),
			makeRow({
				giftId: 3,
				itemId: 102,
				itemTitle: 'Hand-thrown ceramic mug set',
				totalCost: null,
				itemUrl: null,
				itemImageUrl: 'https://placehold.co/120x120/333/fff',
			}),
		]),
	],
	parameters: { docs: { description: { story: 'Multiple orphans on the same list. Each row gets its own ack button.' } } },
}

export const PartnerPurchase: Story = {
	decorators: [
		withRows(1, [
			makeRow({
				giftId: 4,
				itemTitle: 'Cast-iron Dutch oven',
				isPartnerPurchase: true,
				totalCost: '180.00',
			}),
		]),
	],
	parameters: {
		docs: {
			description: {
				story:
					'Partner is the primary gifter on the claim. The "Claimed by your partner" annotation surfaces so the viewer knows who actually bought it.',
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await expect(canvas.getByText(/claimed by your partner/i)).toBeInTheDocument()
	},
}

export const NoImageNoPrice: Story = {
	decorators: [
		withRows(1, [
			makeRow({
				giftId: 5,
				itemTitle: 'Mystery item with no image and no recorded price',
				itemImageUrl: null,
				itemUrl: null,
				totalCost: null,
				itemPrice: null,
			}),
		]),
	],
	parameters: { docs: { description: { story: 'Edge case: no image, no link, no recorded cost. Layout should still be readable.' } } },
}

export const Empty: Story = {
	decorators: [withRows(1, [])],
	parameters: {
		docs: {
			description: {
				story:
					'No orphans on the list. The alert renders nothing. Story shows the bare wrapper as a sanity check that the component is wired but conditionally hidden.',
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await expect(canvas.queryByRole('alert')).not.toBeInTheDocument()
	},
}
