// Server functions for the OAuth consent page (`/oauth/consent`), which
// the better-auth `mcp()` plugin redirects to after a signed-in user
// starts connecting an AI client. Read-only: the actual accept / deny
// goes straight to better-auth's `/api/auth/oauth2/consent` endpoint.

import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { oauthApplication } from '@/db/schema'
import { loggingMiddleware } from '@/lib/logger'
import { getAppSettings } from '@/lib/settings-loader'
import { LIMITS } from '@/lib/validation/limits'
import { authMiddleware } from '@/middleware/auth'

const clientInfoInput = z.object({
	clientId: z.string().min(1).max(LIMITS.SHORT_ID),
})

export type OAuthClientInfo = {
	/** False when the admin has the MCP surface switched off. */
	enabled: boolean
	client: { name: string; icon: string | null } | null
}

// What the consent card shows: the registered client's display name.
// Session-gated because consent itself requires a session, and the
// registered name is client-supplied text we only surface to the user
// who is about to approve it.
export const fetchOAuthClientInfo = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.infer<typeof clientInfoInput>) => clientInfoInput.parse(data))
	.handler(async ({ data }): Promise<OAuthClientInfo> => {
		const settings = await getAppSettings(db)
		if (!settings.enableMcp) return { enabled: false, client: null }
		const rows = await db
			.select({ name: oauthApplication.name, icon: oauthApplication.icon, disabled: oauthApplication.disabled })
			.from(oauthApplication)
			.where(eq(oauthApplication.clientId, data.clientId))
			.limit(1)
		const row = rows.at(0)
		if (!row || row.disabled) return { enabled: true, client: null }
		return { enabled: true, client: { name: row.name, icon: row.icon } }
	})
