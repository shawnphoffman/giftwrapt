import type { Meta, StoryObj } from '@storybook/react-vite'

import type { OauthGrantRow } from '@/api/_mcp-admin-impl'

import { McpGrantsTable } from './mcp-grants-table'

const now = Date.now()
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const at = (offsetMs: number) => new Date(now + offsetMs).toISOString()

const grants: Array<OauthGrantRow> = [
	{
		id: 't1',
		clientId: 'cid_claude',
		clientName: 'Claude',
		userId: 'u1',
		userName: 'Shawn',
		userEmail: 'shawn@example.com',
		scopes: 'openid profile email offline_access',
		createdAt: at(-10 * DAY),
		lastUsedAt: at(-5 * 60 * 1000),
		accessTokenExpiresAt: at(50 * 60 * 1000),
		refreshTokenExpiresAt: at(20 * DAY),
		access: 'write',
	},
	{
		id: 't2',
		clientId: 'cid_cursor',
		clientName: 'Cursor',
		userId: 'u2',
		userName: 'Kate',
		userEmail: 'kate@example.com',
		scopes: 'openid profile email offline_access',
		createdAt: at(-28 * DAY),
		lastUsedAt: at(-6 * DAY),
		accessTokenExpiresAt: at(-6 * DAY + HOUR),
		refreshTokenExpiresAt: at(2 * DAY),
		access: 'read',
	},
]

const meta = {
	title: 'Admin/McpGrantsTable',
	component: McpGrantsTable,
	parameters: { layout: 'padded' },
	args: { grants, onRevoke: () => {} },
} satisfies Meta<typeof McpGrantsTable>

export default meta
type Story = StoryObj<typeof meta>

export const Populated: Story = {
	parameters: { docs: { description: { story: "Kate's Cursor grant signs out in two days unless used, so its expiry is highlighted." } } },
}

export const Empty: Story = { args: { grants: [] } }

export const Busy: Story = { args: { busyGrantId: 't1' } }
