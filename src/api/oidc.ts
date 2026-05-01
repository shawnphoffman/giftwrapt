// Public OIDC server fns. These run for any signed-in user (consent
// submission, fetching minimal client metadata for display) and are
// distinct from the admin CRUD in `admin-oidc.ts`.

import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { oauthApplication } from '@/db/schema'
import { loggingMiddleware } from '@/lib/logger'
import { authMiddleware } from '@/middleware/auth'

export type OidcClientPublicInfo = {
	clientId: string
	name: string
	icon: string | null
	type: string
}

const GetOidcClientInputSchema = z.object({ clientId: z.string().min(1) })

export const getOidcClientPublicInfo = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof GetOidcClientInputSchema>) => GetOidcClientInputSchema.parse(data))
	.handler(async ({ data }): Promise<OidcClientPublicInfo | null> => {
		const result = await db
			.select({
				clientId: oauthApplication.clientId,
				name: oauthApplication.name,
				icon: oauthApplication.icon,
				type: oauthApplication.type,
				disabled: oauthApplication.disabled,
			})
			.from(oauthApplication)
			.where(eq(oauthApplication.clientId, data.clientId))
		const row = result.at(0)
		if (!row || row.disabled) return null
		return { clientId: row.clientId, name: row.name, icon: row.icon, type: row.type }
	})
