import type { Meta, StoryObj } from '@storybook/react-vite'

import type { OauthClientRow } from '@/api/_mcp-admin-impl'

import { McpClientsTable } from './mcp-clients-table'

const now = Date.now()
const ago = (ms: number) => new Date(now - ms).toISOString()
const DAY = 24 * 60 * 60 * 1000

const clients: Array<OauthClientRow> = [
	{
		id: 'a',
		clientId: 'cid_claude_0123456789abcdef',
		name: 'Claude',
		createdAt: ago(30 * DAY),
		disabled: false,
		activeGrants: 3,
		activeUsers: 2,
		lastUsedAt: ago(2 * 60 * 1000),
	},
	{
		id: 'b',
		clientId: 'cid_cursor_0123456789abcdef',
		name: 'Cursor',
		createdAt: ago(9 * DAY),
		disabled: false,
		activeGrants: 1,
		activeUsers: 1,
		lastUsedAt: ago(3 * DAY),
	},
	{
		id: 'c',
		clientId: 'cid_probe_0123456789abcdef',
		name: '',
		createdAt: ago(DAY),
		disabled: false,
		activeGrants: 0,
		activeUsers: 0,
		lastUsedAt: null,
	},
]

const meta = {
	title: 'Admin/McpClientsTable',
	component: McpClientsTable,
	parameters: { layout: 'padded' },
	args: { clients, onToggleDisabled: () => {}, onDelete: () => {} },
} satisfies Meta<typeof McpClientsTable>

export default meta
type Story = StoryObj<typeof meta>

export const Populated: Story = {}

export const Empty: Story = { args: { clients: [] } }

export const WithDisabledClient: Story = {
	args: { clients: [{ ...clients[0], disabled: true, activeGrants: 0, activeUsers: 0 }, clients[1]] },
	parameters: {
		docs: { description: { story: 'Disabling a client revokes its tokens and blocks new sign-ins until it is enabled again.' } },
	},
}

export const Busy: Story = { args: { busyClientId: clients[0].clientId } }
