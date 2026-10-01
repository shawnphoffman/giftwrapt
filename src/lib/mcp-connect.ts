// Client-safe helpers for the "connect an AI assistant" snippets shown on
// /admin/mcp and /settings/connected-apps. Everything derives from the
// deployment origin so pre-built images stay host-agnostic.

import { MCP_ENDPOINT_PATH } from '@/lib/mcp-config'

export type McpConnectInfo = {
	origin: string
	endpointUrl: string
	discovery: Array<{ label: string; url: string }>
}

export function buildMcpConnectInfo(origin: string): McpConnectInfo {
	const base = origin.replace(/\/+$/u, '')
	return {
		origin: base,
		endpointUrl: `${base}${MCP_ENDPOINT_PATH}`,
		discovery: [
			{ label: 'Authorization server', url: `${base}/.well-known/oauth-authorization-server` },
			{ label: 'Protected resource', url: `${base}/.well-known/oauth-protected-resource${MCP_ENDPOINT_PATH}` },
		],
	}
}

const CLAUDE_ADD_CONNECTOR_URL = 'https://claude.ai/customize/connectors'
const DEFAULT_CONNECTOR_NAME = 'GiftWrapt'

/** The name a connector for this deployment shows under in the client: the instance title, or the product name when there is none. */
export function mcpConnectorName(appTitle: string | null | undefined): string {
	return appTitle?.trim() || DEFAULT_CONNECTOR_NAME
}

/**
 * A link that opens Claude's "Add custom connector" dialog with this
 * deployment's name and server URL prefilled, so a user confirms instead
 * of finding the settings page and pasting. Claude shows that the values
 * came from an external link and adds nothing until the user confirms.
 * Format per https://claude.com/docs/connectors/building/directory-vs-custom.
 * Values are percent-encoded (not form-encoded): a `+` for a space is not
 * guaranteed to be read back as a space.
 */
export function buildClaudeConnectLink(endpointUrl: string, appTitle?: string | null): string {
	const name = encodeURIComponent(mcpConnectorName(appTitle))
	const url = encodeURIComponent(endpointUrl)
	return `${CLAUDE_ADD_CONNECTOR_URL}?modal=add-custom-connector&connectorName=${name}&connectorUrl=${url}`
}

export type McpClientSnippet = { id: string; title: string; description: string; code: string; language: 'bash' | 'json' | 'text' }

export function buildMcpSnippets(endpointUrl: string): Array<McpClientSnippet> {
	return [
		{
			id: 'claude-ai',
			title: 'Claude.ai (web, desktop, mobile)',
			description: 'Use the Add to Claude button above, or go to Settings, Connectors, Add custom connector and paste the server URL.',
			code: endpointUrl,
			language: 'text',
		},
		{
			id: 'claude-code',
			title: 'Claude Code',
			description: 'Then run /mcp inside Claude Code to sign in.',
			code: `claude mcp add --transport http giftwrapt ${endpointUrl}`,
			language: 'bash',
		},
		{
			id: 'json-url',
			title: 'Cursor, VS Code, Windsurf, and other URL-based clients',
			description: 'Add this to the client’s MCP configuration.',
			code: JSON.stringify({ mcpServers: { giftwrapt: { url: endpointUrl } } }, null, 2),
			language: 'json',
		},
		{
			id: 'mcp-remote',
			title: 'Clients that only speak stdio',
			description: 'Bridge through mcp-remote, which handles the OAuth sign-in in your browser.',
			code: JSON.stringify({ mcpServers: { giftwrapt: { command: 'npx', args: ['-y', 'mcp-remote', endpointUrl] } } }, null, 2),
			language: 'json',
		},
	]
}
