// Turns the query the better-auth `mcp()` plugin appends to `/sign-in`
// back into the authorize URL the browser must revisit once a session
// exists. The plugin redirects an unauthenticated authorize request to
// `loginPage?<original authorize query>` (see
// node_modules/better-auth/dist/plugins/mcp/authorize.mjs); the sign-in
// page feeds this through `safeRedirect`, which allows `/api/...` paths.
//
// The fold happens at render time (`resolvePostAuthRedirect`), never in
// `validateSearch`. The router redirects to the normalised URL whenever
// `validateSearch` returns something other than what the URL carried,
// and in non-strict mode the unknown OAuth params survive that redirect,
// so folding them there re-folded on every pass and grew the URL until
// Vercel answered URI_TOO_LONG (2026-09-30). `passThroughSearch` is the
// idempotent `validateSearch` the auth pages use instead.
//
// Client-safe: no server imports. Unit-tested in
// src/lib/__tests__/oauth-relay.test.ts.

export const MCP_AUTHORIZE_PATH = '/api/auth/mcp/authorize'

/**
 * Returns the authorize relay path when `search` carries an OAuth
 * authorization request (`client_id` + `redirect_uri`), otherwise null.
 * Only string-valued entries are forwarded.
 */
export function authorizeRelayPath(search: Record<string, unknown>): string | null {
	if (typeof search.client_id !== 'string' || typeof search.redirect_uri !== 'string') return null
	const params = new URLSearchParams()
	for (const [key, value] of Object.entries(search)) {
		// `redirect` is the sign-in page's own param, not part of the
		// authorize request.
		if (key !== 'redirect' && typeof value === 'string') params.set(key, value)
	}
	return `${MCP_AUTHORIZE_PATH}?${params.toString()}`
}

/** The search an auth page accepts: its own `redirect` plus whatever an OAuth authorize request carried. */
export type AuthPageSearch = { redirect?: string; [key: string]: string | undefined }

/**
 * Idempotent `validateSearch` for the auth pages: keeps every string-valued
 * param exactly as the URL carried it, so the router never has to redirect
 * to a normalised URL. Fold with `resolvePostAuthRedirect` when reading.
 */
export function passThroughSearch(search: Record<string, unknown>): AuthPageSearch {
	const out: AuthPageSearch = {}
	for (const [key, value] of Object.entries(search)) {
		if (typeof value === 'string') out[key] = value
	}
	return out
}

/**
 * Where to send the browser after a successful sign-in: the authorize relay
 * when the search is an OAuth authorize request, otherwise the page's own
 * `redirect` param (which may itself be a relay, after the two-factor hop).
 */
export function resolvePostAuthRedirect(search: AuthPageSearch): string | undefined {
	return authorizeRelayPath(search) ?? search.redirect
}

/** True when a post-auth `redirect` target is the authorize relay. */
export function isAuthorizeRelay(target: string | undefined): boolean {
	return typeof target === 'string' && target.startsWith(`${MCP_AUTHORIZE_PATH}?`)
}
