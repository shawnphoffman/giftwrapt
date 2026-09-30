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

export type McpClientSnippet = { id: string; title: string; description: string; code: string; language: 'bash' | 'json' | 'text' }

export function buildMcpSnippets(endpointUrl: string): Array<McpClientSnippet> {
	return [
		{
			id: 'claude-ai',
			title: 'Claude.ai (web, desktop, mobile)',
			description: 'Settings, Connectors, Add custom connector. Paste the server URL and sign in when asked.',
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
