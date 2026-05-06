// Verbose mobile-API error envelope. See
// `.notes/plans/2026-04-mobile-view-and-claim.md` (Conventions).
//
// Wire shape (locked in):
//   { error: { code: string, message: string, data?: object } }
//
// iOS keys off `code`. `message` is fallback display copy. `data`
// carries structured details (e.g. `{remaining: 2}` for over-claim,
// `{blockingItemTitle: "..."}` for group conflicts).

import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export interface MobileError {
	code: string
	message: string
	data?: Record<string, unknown>
}

export interface MobileErrorEnvelope {
	error: MobileError
}

const DEFAULT_MESSAGES: Partial<Record<string, string>> = {
	unauthorized: 'Authentication required.',
	forbidden: 'You don’t have access to this resource.',
	'not-found': 'Not found.',
	'not-yours': 'You don’t own this resource.',
	'not-authorized': 'You don’t have permission to do that.',
	'not-visible': 'Not found.',
	'is-owner': 'You can’t do that on your own list.',
	'cannot-claim-own-list': 'You can’t claim items on your own list.',
	'invalid-input': 'The submitted data is invalid.',
	'invalid-id': 'The submitted id is invalid.',
	'invalid-json': 'The request body must be valid JSON.',
	'invalid-url': 'The url is invalid.',
	'missing-url': 'A url is required.',
	'rate-limited': 'Too many requests. Try again shortly.',
	'mobile-app-disabled': 'Mobile API is disabled by the administrator.',
	'sign-in-failed': 'Email or password is incorrect.',
	'invalid-challenge': 'Sign-in challenge expired or already used. Please start over.',
	'invalid-code': 'That code is incorrect or expired.',
	'over-claim': 'Not enough remaining quantity.',
	'group-already-claimed': 'Another item in this group has already been claimed.',
	'group-out-of-order': 'Earlier items in this group must be claimed first.',
	unavailable: 'This item is no longer available.',
	'item-not-found': 'Item not found.',
	'list-not-found': 'List not found.',
	'source-not-visible': 'You can’t see the source list.',
	'mixed-lists': 'Items must all belong to the same list.',
	'already-archived': 'Already archived.',
	'self-delete': 'You can’t delete yourself.',
	'not-owner': 'Only the owner can do that.',
	'child-cannot-create-gift-ideas': 'Children can’t create gift-ideas lists.',
	'invalid-type': 'Invalid list type.',
	'storage-not-configured': 'File storage is not configured.',
	'in-use': 'Resource is still referenced by another row.',
	'internal-error': 'Something went wrong.',
}

/** Build a `MobileErrorEnvelope` for the given code. */
export function buildError(code: string, opts?: { message?: string; data?: Record<string, unknown> }): MobileErrorEnvelope {
	return {
		error: {
			code,
			message: opts?.message ?? DEFAULT_MESSAGES[code] ?? 'Request failed.',
			...(opts?.data ? { data: opts.data } : {}),
		},
	}
}

/**
 * Render a JSON error response on the given Hono context. Always returns
 * the verbose envelope shape; pass `data` for structured details that
 * iOS can branch on.
 */
export function jsonError(
	c: Context,
	status: ContentfulStatusCode,
	code: string,
	opts?: { message?: string; data?: Record<string, unknown> }
): Response {
	return c.json(buildError(code, opts), status)
}
