// OAuth discovery document at the deployment origin. MCP clients resolve
// the authorization server from here (RFC 8414 / RFC 9728); better-auth's
// own copy under /api/auth/.well-known/* is not where they look. The
// handler lives in src/server/mcp/discovery.ts and returns 404 while the
// `enableMcp` setting is off.
//
// The `[.]` in the directory name escapes the dot for the route generator
// so the URL segment is `.well-known`. Top-level imports stay client-safe
// (this file is imported by routeTree.gen.ts).

import { createFileRoute } from '@tanstack/react-router'

const handle = async (): Promise<Response> => {
	const { handleDiscovery } = await import('@/server/mcp/discovery')
	return handleDiscovery('protected-resource')
}

export const Route = createFileRoute('/.well-known/oauth-protected-resource/$')({
	server: {
		handlers: {
			GET: () => handle(),
		},
	},
})
