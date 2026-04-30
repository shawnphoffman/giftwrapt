// Server functions powering the per-user "Devices" settings page.
// Wraps better-auth's apiKey plugin so signed-in users can mint a
// per-device key for the iOS companion app, see their existing keys,
// and revoke them. The plaintext key is only returned once at creation;
// listings strip the `key` field server-side.
//
// Each fn checks the global `enableMobileApp` setting and returns a
// `mobile-app-disabled` error when it's off, so an admin toggle is the
// kill switch for the whole surface.

import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { z } from 'zod'

import { db } from '@/db'
import { auth } from '@/lib/auth'
import { loggingMiddleware } from '@/lib/logger'
import { getAppSettings } from '@/lib/settings-loader'
import { LIMITS } from '@/lib/validation/limits'
import { authMiddleware } from '@/middleware/auth'

const createMobileApiKeyInput = z.object({
	deviceName: z.string().min(1).max(LIMITS.SHORT_NAME),
})

const revokeMobileApiKeyInput = z.object({
	keyId: z.string().min(1).max(LIMITS.SHORT_ID),
})

export type MobileApiKeySummary = {
	id: string
	name: string | null
	start: string | null
	createdAt: string
	updatedAt: string
	lastRequest: string | null
	expiresAt: string | null
	enabled: boolean
}

async function ensureMobileAppEnabled(): Promise<void> {
	const settings = await getAppSettings(db)
	if (!settings.enableMobileApp) {
		throw new Error('mobile-app-disabled')
	}
}

function toIsoString(value: Date | string | null | undefined): string | null {
	if (!value) return null
	return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

// List the current user's mobile API keys. Better-auth's listApiKeys
// already scopes to the session user and strips the hashed `key` field.
export const listMyApiKeys = createServerFn({
	method: 'GET',
})
	.middleware([authMiddleware, loggingMiddleware])
	.handler(async (): Promise<Array<MobileApiKeySummary>> => {
		await ensureMobileAppEnabled()
		const keys = await auth.api.listApiKeys({ headers: getRequestHeaders() })
		return keys.map(k => ({
			id: k.id,
			name: k.name ?? null,
			start: k.start ?? null,
			createdAt: toIsoString(k.createdAt) ?? new Date(0).toISOString(),
			updatedAt: toIsoString(k.updatedAt) ?? new Date(0).toISOString(),
			lastRequest: toIsoString(k.lastRequest),
			expiresAt: toIsoString(k.expiresAt),
			enabled: k.enabled !== false,
		}))
	})

// Mint a new key for the current user. Returns the plaintext key once;
// the caller is expected to display it and warn the user that it can't
// be retrieved later.
export const createMyApiKey = createServerFn({
	method: 'POST',
})
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.infer<typeof createMobileApiKeyInput>) => createMobileApiKeyInput.parse(data))
	.handler(async ({ data }): Promise<{ key: string; summary: MobileApiKeySummary }> => {
		await ensureMobileAppEnabled()
		const created = await auth.api.createApiKey({
			body: { name: data.deviceName.trim() },
			headers: getRequestHeaders(),
		})
		const summary: MobileApiKeySummary = {
			id: created.id,
			name: created.name ?? null,
			start: created.start ?? null,
			createdAt: toIsoString(created.createdAt) ?? new Date().toISOString(),
			updatedAt: toIsoString(created.updatedAt) ?? new Date().toISOString(),
			lastRequest: toIsoString(created.lastRequest),
			expiresAt: toIsoString(created.expiresAt),
			enabled: created.enabled !== false,
		}
		return { key: created.key, summary }
	})

// Revoke one of the current user's keys. Better-auth verifies ownership
// and 404s if the keyId belongs to another user, so the session header
// is the only authorization needed here.
export const revokeMyApiKey = createServerFn({
	method: 'POST',
})
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.infer<typeof revokeMobileApiKeyInput>) => revokeMobileApiKeyInput.parse(data))
	.handler(async ({ data }) => {
		await ensureMobileAppEnabled()
		await auth.api.deleteApiKey({
			body: { keyId: data.keyId },
			headers: getRequestHeaders(),
		})
		return { success: true }
	})
