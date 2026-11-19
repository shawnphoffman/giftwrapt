// Verbose mobile-API error envelope. See
// `docs/architecture/mobile-api.md` (Wire contract).
//
// Wire shape (locked in):
//   { error: { code: string, message: string, data?: object } }
//
// iOS keys off `code`. `message` is fallback display copy, in the request's
// language. `data`
// carries structured details (e.g. `{remaining: 2}` for over-claim,
// `{blockingItemTitle: "..."}` for group conflicts).

import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import { m } from '@/paraglide/messages.js'

export interface MobileError {
	code: string
	message: string
	data?: Record<string, unknown>
}

export interface MobileErrorEnvelope {
	error: MobileError
}

// Fallback display copy per code, written in the request's language: the
// server entry resolves it from `Accept-Language` (which iOS sends from the
// device's languages) and message functions read it from there. Functions,
// not strings, so nothing is rendered at module load.
const DEFAULT_MESSAGES: Partial<Record<string, () => string>> = {
	unauthorized: () => m.api_error_unauthorized(),
	'not-found': () => m.api_error_not_found(),
	'not-yours': () => m.api_error_not_yours(),
	'not-authorized': () => m.api_error_not_authorized(),
	'not-visible': () => m.api_error_not_found(),
	'is-owner': () => m.api_error_is_owner(),
	'invalid-input': () => m.api_error_invalid_input(),
	'invalid-id': () => m.api_error_invalid_id(),
	'invalid-json': () => m.api_error_invalid_json(),
	'invalid-url': () => m.api_error_invalid_url(),
	'missing-url': () => m.api_error_missing_url(),
	'rate-limited': () => m.api_error_rate_limited(),
	'mobile-app-disabled': () => m.api_error_mobile_app_disabled(),
	'barcode-disabled': () => m.api_error_barcode_disabled(),
	'invalid-barcode': () => m.api_error_invalid_barcode(),
	'provider-unavailable': () => m.api_error_provider_unavailable(),
	'sign-in-failed': () => m.api_error_sign_in_failed(),
	'invalid-challenge': () => m.api_error_invalid_challenge(),
	'invalid-code': () => m.api_error_invalid_code(),
	'oidc-not-configured': () => m.api_error_oidc_not_configured(),
	'redirect-not-allowed': () => m.api_error_redirect_not_allowed(),
	'list-not-found': () => m.api_error_list_not_found(),
	'not-owner': () => m.api_error_not_owner(),
	'child-cannot-create-gift-ideas': () => m.api_error_child_cannot_create_gift_ideas(),
	'invalid-type': () => m.api_error_invalid_type(),
	// Scrape failures (`GET /v1/scrape`, 502 with `data.attempts`).
	'dead-link': () => m.api_error_dead_link(),
	'all-providers-failed': () => m.api_error_all_providers_failed(),
	timeout: () => m.api_error_timeout(),
	'no-providers-available': () => m.api_error_no_providers_available(),
	// Photo routes (`POST /v1/products/by-photo`, `POST /v1/items/:itemId/image`).
	'invalid-image': () => m.api_error_invalid_image(),
	'too-large': () => m.api_error_too_large(),
	'photo-to-item-disabled': () => m.api_error_photo_to_item_disabled(),
	'ai-budget-exceeded': () => m.api_error_ai_budget_exceeded(),
	'extract-failed': () => m.api_error_extract_failed(),
	'uploads-disabled': () => m.api_error_uploads_disabled(),
	'storage-failed': () => m.api_error_storage_failed(),
	'internal-error': () => m.api_error_internal_error(),
}

/** Build a `MobileErrorEnvelope` for the given code. */
export function buildError(code: string, opts?: { message?: string; data?: Record<string, unknown> }): MobileErrorEnvelope {
	return {
		error: {
			code,
			message: opts?.message ?? DEFAULT_MESSAGES[code]?.() ?? m.api_error_request_failed(),
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
