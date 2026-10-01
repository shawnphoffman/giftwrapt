// Static guard for the client-bundle boundary. `routeTree.gen.ts` imports
// every route file, so a route that statically imports `@/lib/auth` (top-
// level await), the MCP SDK, or the Hono apps drags server code into the
// browser graph. These routes must load that code lazily inside handlers.

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const ROUTES = path.resolve(__dirname, '../../../routes')

const GUARDED = [
	'api/mcp.ts',
	'api/auth/$.ts',
	'api/mobile/$.ts',
	'[.]well-known/oauth-authorization-server.ts',
	'[.]well-known/openid-configuration.ts',
	'[.]well-known/oauth-protected-resource.$.ts',
]

const ALLOWED_IMPORTS = new Set(['@tanstack/react-router', '@/lib/logger'])

describe('server-only route files keep their top-level imports client-safe', () => {
	for (const file of GUARDED) {
		it(file, () => {
			const source = readFileSync(path.join(ROUTES, file), 'utf8')
			const staticImports = [...source.matchAll(/^import\s[^'"]*['"]([^'"]+)['"]/gmu)].map(m => m[1])
			for (const spec of staticImports) {
				expect(ALLOWED_IMPORTS.has(spec), `${file} statically imports ${spec}`).toBe(true)
			}
			expect(source, `${file} should dynamic-import its server module`).toMatch(/await import\(/u)
		})
	}
})
