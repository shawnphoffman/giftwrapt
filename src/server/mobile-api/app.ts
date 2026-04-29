// Hono app mounted at `/api/mobile/*` by `src/routes/api/mobile/$.ts`.
// Owns the entire REST surface for the iOS companion app: auth, routing,
// versioning, error shaping. This is the boundary that keeps server-only
// code (better-auth, drizzle, pg, scraper providers) out of the client
// bundle - the gateway file dynamic-imports this module so its top-level
// imports never reach the browser.
//
// Why a separate Hono app instead of more TanStack file routes:
//
//   - Versioning. Mobile clients pin to a major API version; we need
//     `/v1/...` and `/v2/...` to coexist for months. Hono's router
//     composition (`app.route('/v1', v1)`) handles this in one line per
//     version; file-routes would mean an explosion of versioned folders.
//
//   - Boundary integrity. Every TanStack file route under `/api/*` adds
//     a row to `routeTree.gen.ts` and pulls its top-level imports into
//     the client graph. Mounting the entire mobile surface behind a
//     single file route (`/api/mobile/$.ts`) gives us one boundary to
//     keep client-safe instead of N.
//
//   - Stable wire contracts. Hono produces predictable JSON; TanStack
//     server fns use an internal RPC format with hashed URLs that change
//     across deploys. Mobile apps can't tolerate that.
//
//   - Isolation. The mobile API never shares middleware or auth with
//     the web's TanStack server fns. That's intentional: mobile uses
//     apiKey, web uses cookies, neither can accidentally weaken the
//     other.

import { Hono } from 'hono'

import { v1 } from './v1'

export const mobileApp = new Hono().basePath('/api/mobile')

mobileApp.route('/v1', v1)

mobileApp.notFound(c => c.json({ error: 'not-found' }, 404))

mobileApp.onError((_err, c) => {
	// Don't leak stack traces or internal details to mobile clients.
	// Real diagnostic info goes to server logs via the existing pino
	// pipeline (any thrown error bubbles to Nitro's logger).
	return c.json({ error: 'internal-error' }, 500)
})
