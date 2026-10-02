// Server functions behind /settings/connected-apps: the AI clients the
// signed-in user has connected, and disconnecting one. Gated by
// `enableMcp` like `mobile-keys.ts` is by `enableMobileApp`.

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
	type ConnectedAppRow,
	listMyConnectedAppsImpl,
	revokeMyConnectedAppImpl,
	type RevokeResult,
	type SetAccessResult,
	setMcpClientAccessImpl,
} from '@/api/_mcp-admin-impl'
import { db } from '@/db'
import { loggingMiddleware } from '@/lib/logger'
import { getAppSettings } from '@/lib/settings-loader'
import { LIMITS } from '@/lib/validation/limits'
import { authMiddleware } from '@/middleware/auth'

async function ensureMcpEnabled(): Promise<void> {
	const settings = await getAppSettings(db)
	if (!settings.enableMcp) throw new Error('mcp-disabled')
}

const clientIdInput = z.object({ clientId: z.string().min(1).max(LIMITS.SHORT_ID) })

export const listMyConnectedApps = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(async ({ context }): Promise<Array<ConnectedAppRow>> => {
		await ensureMcpEnabled()
		return listMyConnectedAppsImpl({ userId: context.session.user.id })
	})

export const revokeMyConnectedApp = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.infer<typeof clientIdInput>) => clientIdInput.parse(data))
	.handler(async ({ context, data }): Promise<RevokeResult> => {
		await ensureMcpEnabled()
		return revokeMyConnectedAppImpl({ userId: context.session.user.id, clientId: data.clientId })
	})

const accessInput = z.object({ clientId: z.string().min(1).max(LIMITS.SHORT_ID), access: z.enum(['read', 'write']) })

// What the signed-in user lets one assistant do: look things up only, or
// also make changes. Called by the consent page just before approving,
// and by Connected Apps to change it afterwards.
export const setMyConnectedAppAccess = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.infer<typeof accessInput>) => accessInput.parse(data))
	.handler(async ({ context, data }): Promise<SetAccessResult> => {
		await ensureMcpEnabled()
		return setMcpClientAccessImpl({ userId: context.session.user.id, clientId: data.clientId, access: data.access })
	})
