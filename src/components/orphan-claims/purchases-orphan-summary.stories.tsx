import type { Decorator, Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, within } from 'storybook/test'

import { PurchasesOrphanSummary } from './purchases-orphan-summary'

// Local copy of the OrphanedClaimSummaryRow wire shape. See
// list-orphan-alert.stories.tsx for the rationale (server-fn import
// chain bleeds `pg` into the storybook bundle).
type OrphanedClaimSummaryRow = {
	listId: number
	listName: string
	listIsActive: boolean
	listOwnerId: string
	recipientKind: 'user' | 'dependent'
	recipientName: string
	count: number
}

// `PurchasesOrphanSummary` reads `getOrphanedClaimsSummary` via React Query.
// Stories prime a fresh QueryClient with the rows we want to render so
// the alert mounts deterministically without hitting the server.

function makeSummary(overrides: Partial<OrphanedClaimSummaryRow> = {}): OrphanedClaimSummaryRow {
	return {
		listId: 1,
		listName: 'Birthday Wishlist',
		listIsActive: true,
		listOwnerId: 'user_owner',
		recipientKind: 'user',
		recipientName: 'Alex',
		count: 1,
		...overrides,
	}
}

function withSummary(rows: Array<OrphanedClaimSummaryRow>): Decorator {
	return Story => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
		client.setQueryData(['orphan-claims', 'summary'], rows)
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
	title: 'OrphanClaims/PurchasesOrphanSummary',
	component: PurchasesOrphanSummary,
	parameters: { layout: 'padded' },
} satisfies Meta<typeof PurchasesOrphanSummary>

export default meta
type Story = StoryObj<typeof meta>

export const SingleListSingleItem: Story = {
	decorators: [withSummary([makeSummary()])],
	parameters: { docs: { description: { story: 'One item across one list. The "1 item" copy hits the singular branch.' } } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await expect(canvas.getByRole('alert')).toBeInTheDocument()
		await expect(canvas.getByText(/1 item for Alex/i)).toBeInTheDocument()
		// `Button asChild` + a tanstack-router `Link` inside the storybook
		// MockRouterProvider doesn't always surface `role="link"` cleanly to
		// the addon-vitest runner; querying by text is good enough proof
		// that the navigation affordance rendered.
		await expect(canvas.getByText(/open list/i)).toBeInTheDocument()
	},
}

export const MultipleLists: Story = {
	decorators: [
		withSummary([
			makeSummary({ listId: 1, listName: 'Birthday Wishlist', recipientName: 'Alex', count: 3 }),
			makeSummary({ listId: 2, listName: "Casey's Christmas", recipientName: 'Casey', count: 1 }),
			makeSummary({ listId: 7, listName: 'House Projects', recipientName: 'Madison', count: 5 }),
		]),
	],
	parameters: { docs: { description: { story: 'Multiple lists with orphans. Sorted by count desc.' } } },
}

export const ArchivedList: Story = {
	decorators: [
		withSummary([
			makeSummary({
				listId: 12,
				listName: 'Christmas 2024',
				listIsActive: false,
				recipientName: 'Jordan',
				count: 2,
			}),
		]),
	],
	parameters: {
		docs: {
			description: {
				story:
					'The recipient archived the list after the orphans were created. The annotation surfaces so the gifter knows the link still works for orphan resolution only.',
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await expect(canvas.getByText(/list archived/i)).toBeInTheDocument()
	},
}

export const DependentRecipient: Story = {
	decorators: [
		withSummary([
			makeSummary({
				listId: 4,
				listName: "Buddy's Wishlist",
				recipientKind: 'dependent',
				recipientName: 'Buddy',
				count: 2,
			}),
		]),
	],
	parameters: {
		docs: {
			description: {
				story: 'Dependent-subject list. The recipient name surfaces the dependent (not the guardian-creator).',
			},
		},
	},
}

export const Empty: Story = {
	decorators: [withSummary([])],
	parameters: {
		docs: {
			description: {
				story: 'No orphans across any of the viewer or partner claims. The alert renders nothing.',
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await expect(canvas.queryByRole('alert')).not.toBeInTheDocument()
	},
}
