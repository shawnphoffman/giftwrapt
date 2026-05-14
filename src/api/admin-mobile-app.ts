// Server functions for the admin mobile-app config page. Reads and
// writes the single `mobileApp` row in `app_settings`. The redirect-
// URI whitelist gates passkey AND OIDC begin endpoints on the mobile
// API; see [src/server/mobile-api/v1/auth.ts]'s
// `configuredMobileRedirectUris`. The default ships
// `wishlists://oauth` (the canonical iOS app's URL scheme) so fresh
// deployments have passkey on out of the box.
//
// No secrets in this blob, so no encryption pass; the writer is a
// plain `updateAppSettings`-style upsert.

import { createServerFn } from '@tanstack/react-start'

import { db } from '@/db'
import { appSettings } from '@/db/schema'
import { createLogger } from '@/lib/logger'
import { type MobileAppConfig, mobileAppConfigSchema } from '@/lib/settings'
import { getAppSettings } from '@/lib/settings-loader'
import { adminAuthMiddleware } from '@/middleware/auth'

const log = createLogger('admin:mobile-app')

export type MobileAppConfigResponse = MobileAppConfig

export const fetchMobileAppConfigAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware])
	.handler(async (): Promise<MobileAppConfigResponse> => {
		const settings = await getAppSettings(db)
		return settings.mobileApp
	})

export type UpdateMobileAppConfigResult = { ok: true } | { ok: false; error: string }

export const updateMobileAppConfigAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware])
	.inputValidator((data: MobileAppConfig) => mobileAppConfigSchema.parse(data))
	.handler(async ({ data }): Promise<UpdateMobileAppConfigResult> => {
		const parsed = mobileAppConfigSchema.safeParse(data)
		if (!parsed.success) {
			return { ok: false, error: parsed.error.issues.map(i => i.message).join('; ') }
		}
		await db
			.insert(appSettings)
			.values({ key: 'mobileApp', value: parsed.data })
			.onConflictDoUpdate({ target: appSettings.key, set: { value: parsed.data } })
		log.info({ redirectUriCount: parsed.data.redirectUris.length }, 'mobile-app settings updated')
		return { ok: true }
	})
