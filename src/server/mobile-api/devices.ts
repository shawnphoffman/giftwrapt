// Device-management impls for the mobile API. Wraps better-auth's
// apiKey plugin so the Hono routes stay thin shims.
//
// Convention: the `device` shape returned here is identical between
// `POST /v1/sign-in` and each row of `GET /v1/me/devices`, so iOS
// stores a single shape in its model layer.

import { and, eq } from 'drizzle-orm'

import { db } from '@/db'
import { apikey } from '@/db/schema'
import { auth } from '@/lib/auth'

export interface MobileDevice {
	id: string
	prefix: string | null
	name: string | null
	createdAt: string
	updatedAt: string
	lastRequest: string | null
	expiresAt: string | null
}

function toIso(value: Date | string | null | undefined): string | null {
	if (!value) return null
	return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function toMobileDevice(row: {
	id: string
	prefix?: string | null
	name?: string | null
	createdAt: Date | string
	updatedAt: Date | string
	lastRequest?: Date | string | null
	expiresAt?: Date | string | null
}): MobileDevice {
	return {
		id: row.id,
		prefix: row.prefix ?? null,
		name: row.name ?? null,
		createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
		updatedAt: toIso(row.updatedAt) ?? new Date(0).toISOString(),
		lastRequest: toIso(row.lastRequest ?? null),
		expiresAt: toIso(row.expiresAt ?? null),
	}
}

/** List all of the user's apiKey rows, ordered most-recently-active first. */
export async function listDevicesForUserImpl(userId: string): Promise<Array<MobileDevice>> {
	const rows = await db.query.apikey.findMany({
		where: eq(apikey.userId, userId),
	})
	const mapped = rows.map(toMobileDevice)
	mapped.sort((a, b) => {
		const aTs = a.lastRequest ? Date.parse(a.lastRequest) : Date.parse(a.createdAt)
		const bTs = b.lastRequest ? Date.parse(b.lastRequest) : Date.parse(b.createdAt)
		return bTs - aTs
	})
	return mapped
}

export type RevokeDeviceResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' }

/** Revoke a single apiKey owned by `userId`. */
export async function revokeDeviceImpl(userId: string, keyId: string): Promise<RevokeDeviceResult> {
	const row = await db.query.apikey.findFirst({
		where: and(eq(apikey.id, keyId), eq(apikey.userId, userId)),
		columns: { id: true },
	})
	if (!row) return { kind: 'error', reason: 'not-found' }
	await db.delete(apikey).where(and(eq(apikey.id, keyId), eq(apikey.userId, userId)))
	return { kind: 'ok' }
}

/**
 * Revoke ALL of the user's apiKeys, including the calling device's.
 * Returns the count revoked. iOS treats the next 401 as the sign-out
 * signal (clear keychain, push to sign-in screen).
 */
export async function revokeAllDevicesImpl(userId: string): Promise<{ revoked: number }> {
	const rows = await db.delete(apikey).where(eq(apikey.userId, userId)).returning({ id: apikey.id })
	return { revoked: rows.length }
}

/**
 * Mint a new apiKey for `userId` named `deviceName`. Wraps better-auth
 * so the upstream rate-limit / hashing rules stay in one place. Returns
 * the plaintext key (only available at creation) plus the device summary
 * iOS displays in its keychain bookkeeping.
 */
export async function createDeviceForUserImpl(userId: string, deviceName: string): Promise<{ apiKey: string; device: MobileDevice }> {
	const created = await auth.api.createApiKey({
		body: {
			name: deviceName,
			userId,
		},
	})
	return {
		apiKey: created.key,
		device: toMobileDevice({
			id: created.id,
			prefix: created.prefix ?? null,
			name: created.name ?? null,
			createdAt: created.createdAt,
			updatedAt: created.updatedAt,
			lastRequest: created.lastRequest ?? null,
			expiresAt: created.expiresAt ?? null,
		}),
	}
}
