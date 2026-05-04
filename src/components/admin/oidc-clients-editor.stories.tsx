import type { Decorator, Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { OidcClientsEditor } from './oidc-clients-editor'

// Stories run against a fresh QueryClient. The component issues a
// `listOidcApplicationsAsAdmin` server fn which Storybook can't actually
// call. The query stays in `pending` forever in a story without a mock,
// so each variant below provides one via `setQueryData`.

function withInitialData(initialData: Array<unknown>): Decorator {
	return Story => {
		const client = new QueryClient()
		client.setQueryData(['admin', 'oidc-applications'], initialData)
		return (
			<QueryClientProvider client={client}>
				<Story />
			</QueryClientProvider>
		)
	}
}

const SAMPLE_ROWS = [
	{
		id: 'app_1',
		clientId: 'CLIENT_ID_AAA',
		clientSecret: 'secret-aaa',
		name: 'Acme Tasks',
		type: 'web',
		icon: null,
		redirectUrls: ['https://app.example.com/callback'],
		disabled: false,
		createdAt: new Date('2026-04-12T19:24:00Z'),
		updatedAt: new Date('2026-04-12T19:24:00Z'),
	},
	{
		id: 'app_2',
		clientId: 'CLIENT_ID_BBB',
		clientSecret: null,
		name: 'Acme Mobile',
		type: 'public',
		icon: null,
		redirectUrls: ['acme://callback'],
		disabled: true,
		createdAt: new Date('2026-04-09T19:24:00Z'),
		updatedAt: new Date('2026-04-09T19:24:00Z'),
	},
]

const meta = {
	title: 'Admin/OIDC Clients Editor',
	component: OidcClientsEditor,
	parameters: { layout: 'padded' },
} satisfies Meta<typeof OidcClientsEditor>

export default meta
type Story = StoryObj<typeof meta>

export const PopulatedList: Story = {
	decorators: [withInitialData(SAMPLE_ROWS)],
}

export const Empty: Story = {
	decorators: [withInitialData([])],
}
