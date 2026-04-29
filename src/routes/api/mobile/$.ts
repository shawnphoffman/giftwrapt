// Catch-all gateway for the iOS companion app's REST surface. Mounts a
// Hono app that owns everything under `/api/mobile/*` (versioned, with
// its own auth middleware, separate from the web's TanStack server-fn
// stack).
//
// This file's top-level imports are intentionally minimal and
// client-safe: `routeTree.gen.ts` imports it, so anything pulled in here
// ships to the browser. The Hono app itself - including the better-auth
// import chain and every server-only impl - is loaded via dynamic
// `import()` inside the handler bodies, which Vite emits as separate
// chunks that are never fetched by the client.
//
// Versioning lives inside the Hono app (`app.route('/v1', v1)`), not in
// this file's URL. The mobile app pins to a major version; new versions
// can ship alongside without breaking pinned clients.

import { createFileRoute } from '@tanstack/react-router'

const handle = async (request: Request): Promise<Response> => {
	const { mobileApp } = await import('@/server/mobile-api/app')
	return mobileApp.fetch(request)
}

export const Route = createFileRoute('/api/mobile/$')({
	server: {
		handlers: {
			GET: ({ request }) => handle(request),
			POST: ({ request }) => handle(request),
			PUT: ({ request }) => handle(request),
			PATCH: ({ request }) => handle(request),
			DELETE: ({ request }) => handle(request),
		},
	},
})
