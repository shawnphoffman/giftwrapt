// Server functions for the admin OIDC-client config page. Reads and
// writes the single `oidcClient` row in `app_settings`. The mobile
// redirect-URI whitelist used to live here as `mobileRedirectUris`;
// since 2026-05 it's a sibling `mobileApp` row managed via
// `admin-mobile-app.ts`.
//
// `clientSecret` is encrypted at rest (envelope shape via
// `src/lib/crypto/app-secret`); the read returns whether a secret is
// stored without leaking the plaintext, and the write only overwrites
// when the form sent a non-empty value (so re-saving the form without
// re-typing the secret leaves it intact).

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { db } from '@/db'
import { appSettings } from '@/db/schema'
import { createLogger } from '@/lib/logger'
import { DEFAULT_APP_SETTINGS, type OidcClientConfig, oidcClientConfigSchema } from '@/lib/settings'
import { encryptOidcClientSecrets, getAppSettings } from '@/lib/settings-loader'
import { adminAuthMiddleware } from '@/middleware/auth'

const log = createLogger('admin:oidc-client')

export type OidcClientConfigResponse = Omit<OidcClientConfig, 'clientSecret'> & {
	hasClientSecret: boolean
}

export const fetchOidcClientConfigAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware])
	.handler(async (): Promise<OidcClientConfigResponse> => {
		const settings = await getAppSettings(db)
		const { clientSecret, ...rest } = settings.oidcClient
		return {
			...rest,
			hasClientSecret: clientSecret.length > 0,
		}
	})

// Inbound shape mirrors `OidcClientConfig` except `clientSecret` is
// optional - the form sends it only when the admin types a new secret.
// Empty / missing means "leave the stored secret alone".
const updateInputSchema = oidcClientConfigSchema
	.omit({ clientSecret: true })
	.extend({
		clientSecret: z.string().max(2000).optional(),
	})
	.strict()

type UpdateInput = z.infer<typeof updateInputSchema>

export type UpdateOidcClientConfigResult = { ok: true } | { ok: false; error: string }

export const updateOidcClientConfigAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware])
	.inputValidator((data: UpdateInput) => updateInputSchema.parse(data))
	.handler(async ({ data }): Promise<UpdateOidcClientConfigResult> => {
		const existing = await getAppSettings(db)
		const merged: OidcClientConfig = {
			...DEFAULT_APP_SETTINGS.oidcClient,
			...existing.oidcClient,
			...data,
			// Preserve the previously-stored secret when the form
			// didn't include a new one (or sent an empty string).
			clientSecret: data.clientSecret && data.clientSecret.length > 0 ? data.clientSecret : existing.oidcClient.clientSecret,
		}

		// Validate the merged shape with the public schema so any
		// constraints (URL length, scope shape) catch even values the
		// admin form sent without `clientSecret`.
		const parsed = oidcClientConfigSchema.safeParse(merged)
		if (!parsed.success) {
			return { ok: false, error: parsed.error.issues.map(i => i.message).join('; ') }
		}

		// Server-side coherence: enabling the flow requires at least a
		// client id and either an issuer URL or explicit endpoints.
		if (parsed.data.enabled) {
			const hasEndpoints =
				parsed.data.issuerUrl.trim().length > 0 ||
				(parsed.data.authorizationUrl.trim().length > 0 && parsed.data.tokenUrl.trim().length > 0)
			if (!parsed.data.clientId.trim() || !parsed.data.clientSecret.trim() || !hasEndpoints) {
				return {
					ok: false,
					error: 'OIDC sign-in needs a client id, client secret, and either an issuer URL or both authorization and token URLs.',
				}
			}
		}

		const encrypted = encryptOidcClientSecrets(parsed.data)
		await db
			.insert(appSettings)
			.values({ key: 'oidcClient', value: encrypted })
			.onConflictDoUpdate({ target: appSettings.key, set: { value: encrypted } })
		log.info({ enabled: parsed.data.enabled }, 'OIDC client settings updated')
		return { ok: true }
	})

/**
 * Public-readable subset for the sign-in page. No auth required;
 * surfaces only the bits used to render the "Sign in with OpenID"
 * button (or hide it entirely).
 */
export const fetchPublicOidcClientInfo = createServerFn({ method: 'GET' }).handler(
	async (): Promise<{ enabled: boolean; buttonText: string }> => {
		const settings = await getAppSettings(db)
		return {
			enabled: settings.oidcClient.enabled && settings.oidcClient.clientId.length > 0 && settings.oidcClient.clientSecret.length > 0,
			buttonText: settings.oidcClient.buttonText.trim() || 'Sign in with OpenID',
		}
	}
)
