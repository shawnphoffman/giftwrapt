// Sentry beforeSend scrubber, shared between the server SDK (@sentry/node)
// and the browser SDK (@sentry/react). Intentionally light: strips
// credentials and obvious secret-bearing keys, drops query strings off
// the request URL, and removes the auth/cookie headers Sentry's default
// request integration captures.
//
// **Not** a spoiler-protection layer. Item titles, list names, gifter
// IDs, claim metadata, and other domain fields are deliberately allowed
// through so the operator can actually debug issues in their own
// backend. Recipients never see Sentry events (it's a server + browser
// SDK for the deployment, not a recipient-visible surface), so the
// "never leak claim presence to recipients" invariant in
// .notes/logic.md is upheld at the UI layer where it already lives.

import type { ErrorEvent, EventHint } from '@sentry/node'

// Recursively strip top-level keys (case-insensitive) at any depth. Used
// for event extras and breadcrumb data where a credential might appear
// nested inside a payload dump.
const CREDENTIAL_KEYS = new Set(['password', 'token', 'apikey', 'secret', 'authorization', 'cookie', 'set-cookie'])

function shouldRedactKey(key: string): boolean {
	return CREDENTIAL_KEYS.has(key.toLowerCase())
}

function scrubValue(value: unknown, seen: WeakSet<object>): unknown {
	if (value === null || typeof value !== 'object') return value
	if (seen.has(value)) return value
	seen.add(value)
	if (Array.isArray(value)) {
		return value.map(v => scrubValue(v, seen))
	}
	const out: Record<string, unknown> = {}
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		if (shouldRedactKey(k)) {
			out[k] = '[redacted]'
		} else {
			out[k] = scrubValue(v, seen)
		}
	}
	return out
}

function stripUrlQuery(url: string | undefined): string | undefined {
	if (!url) return url
	const queryIdx = url.indexOf('?')
	if (queryIdx === -1) return url
	return url.slice(0, queryIdx)
}

export function scrubEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
	// Request URL: drop query string (may carry tokens, recovery codes, etc.).
	if (event.request?.url) {
		event.request.url = stripUrlQuery(event.request.url)
	}
	// Drop the headers Sentry's request integration captures. Cookies and
	// auth headers are the obvious credential carriers; the rest are kept
	// as debugging signal.
	if (event.request?.headers && typeof event.request.headers === 'object') {
		const headers = event.request.headers as Record<string, unknown>
		for (const k of Object.keys(headers)) {
			if (shouldRedactKey(k)) headers[k] = '[redacted]'
		}
	}
	// Cookies and query string objects: redact entirely. Sentry won't
	// have populated cookies under sendDefaultPii: false, but be defensive.
	if (event.request) {
		delete event.request.cookies
	}

	// Recursive scrub over extras and contexts.
	const seen = new WeakSet<object>()
	if (event.extra) {
		event.extra = scrubValue(event.extra, seen) as ErrorEvent['extra']
	}
	if (event.contexts) {
		event.contexts = scrubValue(event.contexts, seen) as ErrorEvent['contexts']
	}
	if (event.breadcrumbs) {
		for (const crumb of event.breadcrumbs) {
			if (crumb.data) {
				crumb.data = scrubValue(crumb.data, seen) as typeof crumb.data
			}
		}
	}
	return event
}
