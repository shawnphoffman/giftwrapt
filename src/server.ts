import handler from '@tanstack/react-start/server-entry'

import { LOCALE_STRATEGY } from './lib/i18n/strategy'
import { defineCustomServerStrategy } from './paraglide/runtime.js'
import { paraglideMiddleware } from './paraglide/server.js'

// Server entry. Imports are relative on purpose: this file is loaded before
// the `@/` path alias applies.
//
// Paraglide's middleware resolves the request locale once and holds it in
// AsyncLocalStorage for the whole request, so `getLocale()` and every message
// function see it during SSR, in server functions, and in API routes. The
// resolution rule is ours (`resolveRequestLocale`): the user's stored choice,
// the browser's languages, then the deployment default.
defineCustomServerStrategy(LOCALE_STRATEGY, {
	getLocale: async request => {
		if (!request) return undefined
		// Loaded on first use: it reaches the database, which must not be
		// pulled in while this entry module is still being evaluated.
		const { resolveRequestLocale } = await import('./lib/i18n/request-locale')
		return resolveRequestLocale(request)
	},
})

// A page's language depends on these request headers, so a cache must not
// hand one visitor's HTML to another. Paraglide only adds `Vary` for its
// built-in strategies.
const LOCALE_VARY = ['Cookie', 'Accept-Language', 'User-Agent']

function withLocaleVary(response: Response): Response {
	if (!response.headers.get('content-type')?.includes('text/html')) return response
	const existing = (response.headers.get('vary') ?? '')
		.split(',')
		.map(part => part.trim())
		.filter(Boolean)
	const missing = LOCALE_VARY.filter(name => !existing.some(have => have.toLowerCase() === name.toLowerCase()))
	if (missing.length === 0) return response
	try {
		response.headers.set('vary', [...existing, ...missing].join(', '))
		return response
	} catch {
		// Immutable headers (a redirect or a fetched response): copy first.
		const copy = new Response(response.body, response)
		copy.headers.set('vary', [...existing, ...missing].join(', '))
		return copy
	}
}

export default {
	async fetch(req: Request): Promise<Response> {
		return withLocaleVary(await paraglideMiddleware(req, () => handler.fetch(req)))
	},
}
