// Short-lived pending-challenge storage for mobile auth flows that
// can't complete in a single request: TOTP (after a successful
// password step), passkey (after `begin`), and OIDC (between the
// `begin` -> external IdP -> `finish` round trip).
//
// Backed by the existing better-auth `verification` table so we don't
// add a new table for what is effectively a TTL'd key/value store.
// Identifier is namespaced `mobile-auth-pending:<token>`; `value`
// holds JSON keyed by `kind` so a callback for the wrong kind cannot
// consume a token meant for another flow.
//
// Single-use: `consumePending` deletes the row before returning the
// payload, so a leaked token cannot be replayed.

import { randomUUID } from 'node:crypto'

import { and, eq, gt, like, lt } from 'drizzle-orm'

import { db } from '@/db'
import { verification } from '@/db/schema'
import { createLogger } from '@/lib/logger'

const log = createLogger('mobile-auth-pending')

const IDENTIFIER_PREFIX = 'mobile-auth-pending:'

export type MobilePendingPayload =
	| { kind: 'totp'; cookieHeader: string; deviceName: string }
	// Browser-driven sign-in step 1: written by `/v1/auth/{oidc,passkey}/begin`.
	// `flow` distinguishes the two so a leaked token can't redeem
	// the wrong endpoint; `redirectUri` is admin-whitelisted (OIDC)
	// or fixed-by-bundle (passkey) before we get here.
	| { kind: 'browser-init'; flow: 'oidc' | 'passkey'; deviceName: string; redirectUri: string }
	// Browser-driven sign-in step 2: written by `_native-done` after
	// the in-app browser session minted a real session and an apiKey.
	// iOS picks up the envelope via `/v1/auth/{oidc,passkey}/finish`.
	// Single-use; `consumePending` burns the row.
	| { kind: 'browser-result'; flow: 'oidc' | 'passkey'; envelope: Record<string, unknown> }

type PendingKind = MobilePendingPayload['kind']

/** Mint a fresh single-use token, persist the payload, return the token + ttl. */
export async function createPending(payload: MobilePendingPayload, ttlSeconds: number): Promise<{ token: string; ttlSeconds: number }> {
	if (ttlSeconds <= 0 || ttlSeconds > 60 * 60) {
		throw new Error(`mobile-auth-pending: invalid ttlSeconds=${ttlSeconds} (must be 1..3600)`)
	}
	const token = randomUUID()
	const id = randomUUID()
	const expiresAt = new Date(Date.now() + ttlSeconds * 1000)
	await db.insert(verification).values({
		id,
		identifier: `${IDENTIFIER_PREFIX}${token}`,
		value: JSON.stringify(payload),
		expiresAt,
	})
	return { token, ttlSeconds }
}

/**
 * Atomically consume a pending challenge: delete the row and return
 * the payload IFF (a) the row exists, (b) it hasn't expired, and (c)
 * its kind matches `expectedKind`. Returns `null` on any miss; the
 * caller surfaces this as `invalid-challenge`.
 */
export async function consumePending<TKind extends PendingKind>(
	token: string,
	expectedKind: TKind
): Promise<Extract<MobilePendingPayload, { kind: TKind }> | null> {
	if (!token || token.length > 128) return null

	const identifier = `${IDENTIFIER_PREFIX}${token}`
	// Delete-returning so the row is gone whether or not the kind /
	// shape match. A token redeemed against the wrong endpoint is
	// effectively burned, which is the right semantics: callers don't
	// get a second chance to guess the kind.
	const rows = await db
		.delete(verification)
		.where(and(eq(verification.identifier, identifier), gt(verification.expiresAt, new Date())))
		.returning({ value: verification.value })

	if (rows.length === 0) return null
	const row = rows[0]

	let parsed: MobilePendingPayload
	try {
		parsed = JSON.parse(row.value) as MobilePendingPayload
	} catch {
		log.warn({ identifier }, 'pending challenge value not JSON')
		return null
	}
	if (parsed.kind !== expectedKind) return null
	return parsed as Extract<MobilePendingPayload, { kind: TKind }>
}

/**
 * Read a pending payload WITHOUT deleting the row. Used by the OIDC
 * `/_jump` GET endpoint, which needs the providerId to drive the
 * better-auth redirect but doesn't yet want to consume the token -
 * the actual consumption happens when `_native-done` rotates the
 * row, or when an unrelated `consumePending` call burns it on
 * `/finish`. Returns `null` on miss.
 */
export async function peekPending<TKind extends PendingKind>(
	token: string,
	expectedKind: TKind
): Promise<Extract<MobilePendingPayload, { kind: TKind }> | null> {
	if (!token || token.length > 128) return null
	const identifier = `${IDENTIFIER_PREFIX}${token}`
	const rows = await db
		.select({ value: verification.value })
		.from(verification)
		.where(and(eq(verification.identifier, identifier), gt(verification.expiresAt, new Date())))
		.limit(1)
	if (rows.length === 0) return null
	const row = rows[0]
	let parsed: MobilePendingPayload
	try {
		parsed = JSON.parse(row.value) as MobilePendingPayload
	} catch {
		log.warn({ identifier }, 'pending challenge value not JSON')
		return null
	}
	if (parsed.kind !== expectedKind) return null
	return parsed as Extract<MobilePendingPayload, { kind: TKind }>
}

/**
 * Replace the payload under an existing token while keeping the same
 * token live. Used by the OIDC flow's `_native-done` step to rotate
 * an `oidc-init` row into an `oidc-result` row that `/oidc/finish`
 * can consume. Refreshes the TTL.
 *
 * Returns `true` if a row was rotated, `false` if there was nothing
 * to rotate (caller surfaces this as a sign-in failure).
 */
export async function rotatePending(token: string, payload: MobilePendingPayload, ttlSeconds: number): Promise<boolean> {
	if (ttlSeconds <= 0 || ttlSeconds > 60 * 60) {
		throw new Error(`mobile-auth-pending: invalid ttlSeconds=${ttlSeconds} (must be 1..3600)`)
	}
	if (!token || token.length > 128) return false
	const identifier = `${IDENTIFIER_PREFIX}${token}`
	const expiresAt = new Date(Date.now() + ttlSeconds * 1000)
	const rows = await db
		.update(verification)
		.set({ value: JSON.stringify(payload), expiresAt })
		.where(eq(verification.identifier, identifier))
		.returning({ id: verification.id })
	return rows.length > 0
}

/**
 * Best-effort cleanup of expired rows owned by this module. Better-
 * auth's own verification cleanup will eventually GC them, but this
 * lets the cron in `routes/api/cron/*` (or a manual admin sweep)
 * tidy up the mobile-auth-pending namespace explicitly.
 */
export async function cleanupExpiredPending(): Promise<{ deleted: number }> {
	const rows = await db
		.delete(verification)
		.where(and(like(verification.identifier, `${IDENTIFIER_PREFIX}%`), lt(verification.expiresAt, new Date())))
		.returning({ id: verification.id })
	return { deleted: rows.length }
}
