// Client-side stub for `@/db`. Aliased in by Vite when building for the
// browser environment so the client bundle never sees the real module's
// `new Pool(...)` side effect, which would otherwise pull all of pg
// (~140 KB) and drizzle-orm/node-postgres into the bundle even though
// the client never actually uses `db`.
//
// All server functions, route handlers, and middleware run server-side
// only. Any client code that ends up reaching for `db` at runtime is a
// bug - it should be talking to the server via createServerFn or the
// Hono mobile gateway. The Proxy here makes that bug loud instead of
// silent: accessing any property throws.
//
// Type-only imports (`import type { Database, SchemaDatabase } from '@/db'`)
// are erased by TypeScript before they reach this stub, so existing
// client code that imports types continues to compile.

const guard = new Proxy({} as Record<PropertyKey, unknown>, {
	get(_, prop) {
		throw new Error(
			`@/db is server-only; tried to access "${String(prop)}" from a client bundle. This is a bug - use a server fn or the mobile gateway.`
		)
	},
})

export const db = guard
