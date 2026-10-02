// The public tool catalog: written to catalogs/mcp-tools.json by
// `pnpm docs:catalogs` and rendered by the docs site as its tool
// reference. Built from a live `tools/list` so it is exactly what a
// client sees.

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

import type { ToolContext } from './context'
import { createMcpServer } from './server'

export type McpToolCatalogEntry = {
	name: string
	title: string
	description: string
	access: 'read' | 'write'
	destructive: boolean
	readsTheWeb: boolean
}

export async function buildMcpToolCatalog(ctx: ToolContext): Promise<Array<McpToolCatalogEntry>> {
	const server = createMcpServer(ctx)
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
	await server.connect(serverTransport)
	const client = new Client({ name: 'catalog', version: '0' })
	await client.connect(clientTransport)
	try {
		const { tools } = await client.listTools()
		return tools
			.map(t => ({
				name: t.name,
				title: t.title ?? t.name,
				description: t.description ?? '',
				access: t.annotations?.readOnlyHint ? ('read' as const) : ('write' as const),
				destructive: t.annotations?.destructiveHint === true,
				readsTheWeb: t.annotations?.openWorldHint === true,
			}))
			.sort((a, b) => a.name.localeCompare(b.name))
	} finally {
		await client.close()
		await server.close()
	}
}

export function serializeCatalog(catalog: unknown): string {
	return `${JSON.stringify(catalog, null, '\t')}\n`
}
