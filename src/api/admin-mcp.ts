// Server functions behind /admin/mcp: registered OAuth clients and the
// grants users have given them. Every fn checks `enableMcp` and throws
// `mcp-disabled` when it is off, mirroring `mobile-keys.ts`, so the admin
// toggle is the kill switch for this surface too.

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
	deleteOauthClientImpl,
	listOauthClientsImpl,
	listOauthGrantsImpl,
	type OauthClientRow,
	type OauthGrantRow,
	revokeOauthGrantImpl,
	type RevokeResult,
	setOauthClientDisabledImpl,
} from '@/api/_mcp-admin-impl'
import { db } from '@/db'
import { loggingMiddleware } from '@/lib/logger'
import { getAppSettings } from '@/lib/settings-loader'
import { LIMITS } from '@/lib/validation/limits'
import { adminAuthMiddleware } from '@/middleware/auth'

export async function ensureMcpEnabled(): Promise<void> {
	const settings = await getAppSettings(db)
	if (!settings.enableMcp) throw new Error('mcp-disabled')
}

const clientIdInput = z.object({ clientId: z.string().min(1).max(LIMITS.SHORT_ID) })
const tokenIdInput = z.object({ tokenId: z.string().min(1).max(LIMITS.SHORT_ID) })
const setDisabledInput = clientIdInput.extend({ disabled: z.boolean() })
const grantsInput = z.object({ userId: z.string().min(1).max(LIMITS.SHORT_ID).optional() })

export const listOauthClientsAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.handler(async (): Promise<Array<OauthClientRow>> => {
		await ensureMcpEnabled()
		return listOauthClientsImpl()
	})

export const listOauthGrantsAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.infer<typeof grantsInput> | undefined) => grantsInput.parse(data ?? {}))
	.handler(async ({ data }): Promise<Array<OauthGrantRow>> => {
		await ensureMcpEnabled()
		return listOauthGrantsImpl({ userId: data.userId })
	})

export const revokeOauthGrantAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.infer<typeof tokenIdInput>) => tokenIdInput.parse(data))
	.handler(async ({ data }): Promise<RevokeResult> => {
		await ensureMcpEnabled()
		return revokeOauthGrantImpl({ tokenId: data.tokenId })
	})

export const setOauthClientDisabledAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.infer<typeof setDisabledInput>) => setDisabledInput.parse(data))
	.handler(async ({ data }): Promise<RevokeResult> => {
		await ensureMcpEnabled()
		return setOauthClientDisabledImpl({ clientId: data.clientId, disabled: data.disabled })
	})

export const deleteOauthClientAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.infer<typeof clientIdInput>) => clientIdInput.parse(data))
	.handler(async ({ data }): Promise<RevokeResult> => {
		await ensureMcpEnabled()
		return deleteOauthClientImpl({ clientId: data.clientId })
	})
