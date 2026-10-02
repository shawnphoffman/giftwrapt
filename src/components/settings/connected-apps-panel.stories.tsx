import type { Meta, StoryObj } from '@storybook/react-vite'

import type { ConnectedAppRow } from '@/api/_mcp-admin-impl'

import { ConnectedAppsPanel } from './connected-apps-panel'

const now = Date.now()
const DAY = 24 * 60 * 60 * 1000
const at = (offsetMs: number) => new Date(now + offsetMs).toISOString()

const apps: Array<ConnectedAppRow> = [
	{
		clientId: 'cid_claude',
		clientName: 'Claude',
		icon: null,
		connectedAt: at(-12 * DAY),
		lastUsedAt: at(-30 * 60 * 1000),
		activeTokens: 2,
		expiresAt: at(18 * DAY),
		access: 'write',
	},
	{
		clientId: 'cid_cursor',
		clientName: 'Cursor',
		icon: null,
		connectedAt: at(-2 * DAY),
		lastUsedAt: null,
		activeTokens: 1,
		expiresAt: at(28 * DAY),
		access: 'read',
	},
]

const meta = {
	title: 'Settings/ConnectedAppsPanel',
	component: ConnectedAppsPanel,
	parameters: { layout: 'padded' },
	args: { apps, origin: 'https://gifts.example.com', appTitle: 'The Smith Family', onDisconnect: () => {}, onAccessChange: () => {} },
	decorators: [
		Story => (
			<div className="max-w-2xl">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof ConnectedAppsPanel>

export default meta
type Story = StoryObj<typeof meta>

export const Populated: Story = {}

export const Empty: Story = { args: { apps: [] } }

export const Disconnecting: Story = { args: { busyClientId: 'cid_claude' } }
