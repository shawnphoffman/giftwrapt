// The MCP server's Streamable HTTP endpoint. Mounts a Hono app that owns
// `/api/mcp`; auth is an OAuth bearer token issued by better-auth's
// `mcp()` plugin (never the session cookie), and the whole surface goes
// dark when the `enableMcp` setting is off.
//
// The Hono app pulls in better-auth, drizzle, and the MCP SDK, so it is
// loaded lazily inside the handlers exactly like
// `src/routes/api/mobile/$.ts`: the SDK only loads when an assistant
// connects, not on every server cold start. (The client bundle is not the
// concern; TanStack Start strips server handlers from it.)

import { createFileRoute } from '@tanstack/react-router'

const handle = async (request: Request): Promise<Response> => {
	const { mcpApp } = await import('@/server/mcp/app')
	return mcpApp.fetch(request)
}

export const Route = createFileRoute('/api/mcp')({
	server: {
		handlers: {
			GET: ({ request }) => handle(request),
			POST: ({ request }) => handle(request),
			DELETE: ({ request }) => handle(request),
			OPTIONS: ({ request }) => handle(request),
		},
	},
})
