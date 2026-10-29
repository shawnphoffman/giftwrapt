import type { Decorator, Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { BarcodeLookupsList } from './barcode-lookups-list'

// Local copy of the BarcodeLookupListRow shape - importing the type from
// `@/api/admin-barcode` would pull the server fn's import chain (db,
// drizzle) into the storybook bundle.
type BarcodeLookupListRow = {
	id: number
	rawCode: string
	gtin14: string | null
	outcome: string
	source: string | null
	providerId: string | null
	results: Array<{ title?: string; brand?: string; imageUrl?: string; candidateUrl?: string }> | null
	errorMessage: string | null
	ms: number | null
	createdAt: Date
	userId: string | null
	userName: string | null
	userEmail: string | null
}

// BarcodeLookupsList issues one server fn on mount. Storybook can't
// reach the server, so each variant primes a QueryClient with the rows
// (staleTime Infinity keeps the mock's empty array from replacing them).
function withRows(rows: Array<BarcodeLookupListRow>): Decorator {
	return Story => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
		client.setQueryData(['admin', 'barcode-lookups'], rows)
		return (
			<QueryClientProvider client={client}>
				<div className="@container/admin-content max-w-5xl">
					<Story />
				</div>
			</QueryClientProvider>
		)
	}
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000)

const base: BarcodeLookupListRow = {
	id: 1,
	rawCode: '9781400052929',
	gtin14: '09781400052929',
	outcome: 'ok',
	source: 'provider',
	providerId: 'upcitemdb-trial',
	results: [
		{
			title: "The Hitchhiker's Guide to the Galaxy",
			brand: 'Del Rey',
			candidateUrl: 'https://www.example.com/hitchhikers-guide',
		},
	],
	errorMessage: null,
	ms: 412,
	createdAt: minutesAgo(3),
	userId: 'alice',
	userName: 'Alice',
	userEmail: 'alice@example.test',
}

const meta = {
	title: 'Admin/BarcodeLookupsList',
	component: BarcodeLookupsList,
	parameters: { layout: 'padded' },
} satisfies Meta<typeof BarcodeLookupsList>

export default meta
type Story = StoryObj<typeof meta>

export const Populated: Story = {
	decorators: [
		withRows([
			{ ...base, id: 6, source: 'cache', ms: 8, createdAt: minutesAgo(1) },
			{
				...base,
				id: 5,
				rawCode: '0885909950805',
				gtin14: '00885909950805',
				providerId: 'go-upc',
				results: [
					{ title: 'Wireless Earbuds, Charcoal', brand: 'Acme Audio' },
					{ title: 'Wireless Earbuds, Sand', brand: 'Acme Audio' },
					{ title: 'Wireless Earbuds Case' },
				],
				createdAt: minutesAgo(2),
			},
			{ ...base, id: 4, rawCode: '0123456789012', gtin14: '00123456789012', outcome: 'not-found', source: null, results: null, ms: 655 },
			{
				...base,
				id: 3,
				rawCode: '0123456789012',
				gtin14: '00123456789012',
				outcome: 'provider-unavailable',
				source: null,
				providerId: 'go-upc',
				results: null,
				errorMessage: 'Go-UPC responded 429: rate limit exceeded',
				ms: 1203,
				createdAt: minutesAgo(90),
			},
			{
				...base,
				id: 2,
				rawCode: '012993441013',
				gtin14: null,
				outcome: 'invalid-code',
				source: null,
				providerId: null,
				results: null,
				ms: 1,
				createdAt: minutesAgo(60 * 30),
				userId: null,
				userName: null,
				userEmail: null,
			},
		]),
	],
}

export const Empty: Story = {
	decorators: [withRows([])],
}
