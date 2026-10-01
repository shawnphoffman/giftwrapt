// better-auth's HTTP surface. Delegates through the MCP OAuth gateway,
// which enforces the `enableMcp` kill switch on the `mcp()` plugin's
// routes and forces `prompt=consent` on authorize before better-auth
// sees the request (see src/server/mcp/oauth-gateway.ts). Everything
// else passes straight through to `auth.handler`.
//
// Top-level imports stay client-safe: `routeTree.gen.ts` imports this
// file, and `@/lib/auth` has a top-level await that must never reach the
// browser bundle. The gateway is loaded lazily inside the handlers.

import { createFileRoute } from '@tanstack/react-router'

import { createLogger } from '@/lib/logger'

const log = createLogger('api:auth')

const handle = async (request: Request): Promise<Response> => {
	log.debug({ method: request.method, path: new URL(request.url).pathname }, 'auth passthrough')
	const { handleAuthRequest } = await import('@/server/mcp/oauth-gateway')
	return handleAuthRequest(request)
}

export const Route = createFileRoute('/api/auth/$')({
	server: {
		handlers: {
			GET: ({ request }) => handle(request),
			POST: ({ request }) => handle(request),
			OPTIONS: ({ request }) => handle(request),
		},
	},
})
