import type { Meta, StoryObj } from '@storybook/react-vite'

import { McpConnectCard } from './mcp-connect-card'

const ORIGIN = 'https://gifts.example.com'

/**
 * Top card on /admin/mcp. The page fetches the two discovery URLs on
 * mount and feeds the results in as `discoveryStatus`.
 */
const meta = {
	title: 'Admin/McpConnectCard',
	component: McpConnectCard,
	parameters: { layout: 'padded' },
	args: { origin: ORIGIN },
} satisfies Meta<typeof McpConnectCard>

export default meta
type Story = StoryObj<typeof meta>

export const Checking: Story = {}

export const Reachable: Story = {
	args: {
		discoveryStatus: {
			[`${ORIGIN}/.well-known/oauth-authorization-server`]: 'ok',
			[`${ORIGIN}/.well-known/oauth-protected-resource/api/mcp`]: 'ok',
		},
	},
}

export const Unreachable: Story = {
	args: {
		discoveryStatus: {
			[`${ORIGIN}/.well-known/oauth-authorization-server`]: 'unreachable',
			[`${ORIGIN}/.well-known/oauth-protected-resource/api/mcp`]: 'ok',
		},
	},
	parameters: {
		docs: { description: { story: 'A reverse proxy that strips dotfile paths breaks discovery; the card makes that visible.' } },
	},
}
