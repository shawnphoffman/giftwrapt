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

import { db } from '@/db'
import { getAppSettings } from '@/lib/settings-loader'

import { jsonError } from './envelope'
import { minClientVersionHeader } from './middleware'
import { v1 } from './v1'

export const mobileApp = new Hono().basePath('/api/mobile')

// Applied to every response (auth failures, 404s, errors, success).
// Lets iOS hard-update from any response, including pre-auth ones.
mobileApp.use('*', minClientVersionHeader)

// Operator kill switch: when an admin flips `enableMobileApp` off, the
// entire mobile surface returns 503 immediately - including sign-in
// AND every authenticated route. Existing apiKeys keep working only
// while the flag is on, so a leaked key plus a flipped flag means iOS
// is locked out without a redeploy. Defense-in-depth around the
// per-fn checks already in `mobile-keys.ts` and the sign-in route.
mobileApp.use('*', async (c, next) => {
	const settings = await getAppSettings(db)
	if (!settings.enableMobileApp) {
		return jsonError(c, 503, 'mobile-app-disabled')
	}
	return next()
})

mobileApp.route('/v1', v1)

mobileApp.notFound(c => jsonError(c, 404, 'not-found'))

mobileApp.onError((_err, c) => {
	// Don't leak stack traces or internal details to mobile clients.
	// Real diagnostic info goes to server logs via the existing pino
	// pipeline (any thrown error bubbles to Nitro's logger).
	return jsonError(c, 500, 'internal-error')
})
