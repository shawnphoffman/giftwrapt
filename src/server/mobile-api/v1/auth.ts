// Mobile auth-extension routes.
//
// `/v1/auth/capabilities` (no auth) - tells iOS which sign-in methods
// the deployment supports so the client can render the right UI
// without learning about better-auth plugin names.
//
// `/v1/auth/totp/verify` (no auth, opaque challenge token) - the
// finish step for the 2FA fork that `POST /v1/sign-in` opens when
// the password-validated user has TOTP enrolled.
//
// `/v1/auth/passkey/{begin,finish}` (no auth) - WebAuthn assertion
// flow. iOS calls `begin` to get the assertion options + a challenge
// token, runs ASAuthorizationController locally, then posts the
// assertion + deviceName to `finish`.
//
// `/v1/auth/oidc/{begin, _jump, _native-done, finish}` (no auth) -
// external-OIDC sign-in. Single provider per deployment, configured
// at /admin/auth (see `src/components/admin/oidc-client-editor.tsx`).
// The flow is a four-step round trip:
//   1. iOS calls `oidc/begin` and gets back `{ challengeToken, signInUrl }`.
//   2. iOS opens `signInUrl` in `ASWebAuthenticationSession`. The URL
//      points at our `_jump` endpoint, which kicks off better-auth's
//      `signInWithOAuth2` and 302s onward to the IdP. The state cookie
//      lives in the in-app browser session.
//   3. The IdP redirects to better-auth's standard
//      `/api/auth/oauth2/callback/oidc`, which exchanges the code,
//      mints a session, and 302s to our `_native-done` endpoint
//      (configured as `callbackURL` on the begin step).
//   4. `_native-done` reads the session, mints an apiKey, parks the
//      `{ apiKey, user, device }` envelope under the same challenge
//      token, and 302s the browser at the iOS-supplied
//      `redirectUri` (validated against the admin-configured
//      whitelist) so `ASWebAuthenticationSession` returns control.
//   5. iOS posts `oidc/finish` with the token to retrieve the envelope.
//
// All terminal endpoints converge on the same `{ apiKey, user, device }`
// envelope `POST /v1/sign-in` returns, via `mintEnvelopeFromSessionCookie`.

import type { Context, Hono } from 'hono'
import { z } from 'zod'

import { db } from '@/db'
import { env } from '@/env'
import { auth } from '@/lib/auth'
import { createLogger } from '@/lib/logger'
import { mobileSignInLimiter } from '@/lib/rate-limits'
import { getAppSettings } from '@/lib/settings-loader'
import { LIMITS } from '@/lib/validation/limits'

import type { MobileAuthContext } from '../auth'
import { consumePending, createPending, peekPending, rotatePending } from '../auth-pending'
import { mergeSetCookiesToCookieHeader } from '../cookies'
import { jsonError } from '../envelope'
import { rateLimit } from '../middleware'

const oidcLog = createLogger('mobile-api-oidc')

type App = Hono<MobileAuthContext>

const VerifyTotpSchema = z.object({
	challengeToken: z.string().min(1).max(128),
	// TOTP codes are 6 digits today; allow 6-10 to leave room for
	// future configurations (HOTP, longer codes) without forcing a v2.
	code: z.string().min(4).max(10),
})

const PasskeyBeginSchema = z.object({
	// Optional - WebAuthn supports username-less / discoverable
	// credentials. Mobile callers that know the user's email can pass
	// it here so the assertion options include only that user's
	// credentials in `allowCredentials`.
	email: z.string().email().max(LIMITS.EMAIL).optional(),
})

const PasskeyFinishSchema = z.object({
	challengeToken: z.string().min(1).max(128),
	deviceName: z.string().min(1).max(LIMITS.SHORT_NAME),
	// Pass-through of the WebAuthn AuthenticationResponseJSON shape
	// produced by ASAuthorizationController on iOS. Validated by
	// better-auth's `verifyPasskeyAuthentication`.
	response: z.record(z.string(), z.unknown()),
})

const OidcBeginSchema = z.object({
	deviceName: z.string().min(1).max(LIMITS.SHORT_NAME),
	// The URL scheme the iOS app registered for the redirect leg.
	// Validated against `oidcClient.mobileRedirectUris` before any
	// challenge token is minted.
	redirectUri: z.string().min(1).max(2000),
})

const OidcFinishSchema = z.object({
	challengeToken: z.string().min(1).max(128),
})

const OIDC_INIT_TTL_SECONDS = 600
const OIDC_RESULT_TTL_SECONDS = 120

/**
 * Public-readable view of the configured OIDC provider. Reads from
 * `app_settings` live so the iOS capabilities probe always reflects
 * what the admin form last saved (the better-auth plugin still
 * requires a server restart to actually accept new sign-ins, but the
 * probe itself doesn't need to wait for that).
 */
async function configuredOidcProvider(): Promise<{ id: 'oidc'; label: string; mobileRedirectUris: ReadonlyArray<string> } | null> {
	try {
		const settings = await getAppSettings(db)
		const cfg = settings.oidcClient
		if (!cfg.enabled || !cfg.clientId || !cfg.clientSecret) return null
		const hasEndpoints = cfg.issuerUrl.length > 0 || (cfg.authorizationUrl.length > 0 && cfg.tokenUrl.length > 0)
		if (!hasEndpoints) return null
		return {
			id: 'oidc',
			label: cfg.buttonText.trim() || 'Sign in with OpenID',
			mobileRedirectUris: cfg.mobileRedirectUris,
		}
	} catch (err) {
		oidcLog.warn({ err }, 'reading OIDC client settings failed')
		return null
	}
}

export function registerAuthRoutes(v1: App): void {
	// =================================================================
	// GET /v1/auth/capabilities (no auth)
	// =================================================================
	v1.get('/auth/capabilities', rateLimit(mobileSignInLimiter), async c => {
		const passwordEnabled = true
		const totpEnabled = true
		const passkeyEnabled = true

		const provider = await configuredOidcProvider()
		const oidc = provider ? [{ id: provider.id, label: provider.label, kind: 'generic' as const }] : []

		return c.json({
			password: passwordEnabled,
			totp: totpEnabled,
			passkey: passkeyEnabled,
			oidc,
		})
	})

	// =================================================================
	// POST /v1/auth/totp/verify (no auth - opaque challenge token)
	// =================================================================
	v1.post('/auth/totp/verify', rateLimit(mobileSignInLimiter), async c => {
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = VerifyTotpSchema.safeParse(body)
		if (!parsed.success) {
			return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		}
		const { challengeToken, code } = parsed.data

		const pending = await consumePending(challengeToken, 'totp')
		if (!pending) {
			return jsonError(c, 400, 'invalid-challenge')
		}
		const deviceName = pending.deviceName.trim().slice(0, LIMITS.SHORT_NAME)
		if (!deviceName) {
			return jsonError(c, 500, 'internal-error')
		}

		let verifyResponse: Response
		try {
			verifyResponse = await auth.api.verifyTOTP({
				body: { code, trustDevice: false },
				headers: new Headers({ cookie: pending.cookieHeader }),
				asResponse: true,
			})
		} catch {
			return jsonError(c, 401, 'invalid-code')
		}
		if (verifyResponse.status !== 200) {
			return jsonError(c, 401, 'invalid-code')
		}

		const realCookieHeader = mergeSetCookiesToCookieHeader(verifyResponse)
		if (!realCookieHeader) {
			return jsonError(c, 500, 'internal-error')
		}

		return mintEnvelopeFromSessionCookie(c, realCookieHeader, deviceName, 'invalid-code')
	})

	// =================================================================
	// POST /v1/auth/passkey/begin (no auth)
	// =================================================================
	v1.post('/auth/passkey/begin', rateLimit(mobileSignInLimiter), async c => {
		let body: unknown = null
		try {
			const text = await c.req.text()
			body = text ? JSON.parse(text) : {}
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = PasskeyBeginSchema.safeParse(body)
		if (!parsed.success) {
			return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		}

		let optionsResponse: Response
		try {
			optionsResponse = await auth.api.generatePasskeyAuthenticationOptions({
				asResponse: true,
			})
		} catch {
			return jsonError(c, 500, 'internal-error')
		}
		if (optionsResponse.status !== 200) {
			return jsonError(c, 500, 'internal-error')
		}

		const cookieHeader = mergeSetCookiesToCookieHeader(optionsResponse)
		if (!cookieHeader) {
			return jsonError(c, 500, 'internal-error')
		}
		const optionsBody = (await optionsResponse.json()) as Record<string, unknown>

		const PASSKEY_CHALLENGE_TTL_SECONDS = 120
		const { token, ttlSeconds } = await createPending({ kind: 'passkey', cookieHeader }, PASSKEY_CHALLENGE_TTL_SECONDS)

		return c.json({
			challengeToken: token,
			ttlSeconds,
			publicKey: optionsBody,
		})
	})

	// =================================================================
	// POST /v1/auth/passkey/finish (no auth)
	// =================================================================
	v1.post('/auth/passkey/finish', rateLimit(mobileSignInLimiter), async c => {
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = PasskeyFinishSchema.safeParse(body)
		if (!parsed.success) {
			return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		}
		const { challengeToken, deviceName, response } = parsed.data

		const pending = await consumePending(challengeToken, 'passkey')
		if (!pending) {
			return jsonError(c, 400, 'invalid-challenge')
		}
		const trimmedDeviceName = deviceName.trim().slice(0, LIMITS.SHORT_NAME)
		if (!trimmedDeviceName) {
			return jsonError(c, 400, 'invalid-input')
		}

		let verifyResponse: Response
		try {
			verifyResponse = await auth.api.verifyPasskeyAuthentication({
				body: { response: response as never },
				headers: new Headers({ cookie: pending.cookieHeader }),
				asResponse: true,
			})
		} catch {
			return jsonError(c, 401, 'invalid-code')
		}
		if (verifyResponse.status !== 200) {
			return jsonError(c, 401, 'invalid-code')
		}

		const realCookieHeader = mergeSetCookiesToCookieHeader(verifyResponse)
		if (!realCookieHeader) {
			return jsonError(c, 500, 'internal-error')
		}

		return mintEnvelopeFromSessionCookie(c, realCookieHeader, trimmedDeviceName, 'invalid-code')
	})

	// =================================================================
	// POST /v1/auth/oidc/begin (no auth)
	// =================================================================
	v1.post('/auth/oidc/begin', rateLimit(mobileSignInLimiter), async c => {
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = OidcBeginSchema.safeParse(body)
		if (!parsed.success) {
			return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		}
		const { deviceName, redirectUri } = parsed.data

		const provider = await configuredOidcProvider()
		if (!provider) {
			return jsonError(c, 404, 'oidc-not-configured')
		}
		if (!provider.mobileRedirectUris.includes(redirectUri)) {
			return jsonError(c, 400, 'redirect-not-allowed', {
				message: 'redirectUri must match one of the admin-configured mobile redirect URIs.',
			})
		}

		const trimmedDeviceName = deviceName.trim().slice(0, LIMITS.SHORT_NAME)
		if (!trimmedDeviceName) {
			return jsonError(c, 400, 'invalid-input')
		}

		const { token, ttlSeconds } = await createPending(
			{ kind: 'oidc-init', deviceName: trimmedDeviceName, redirectUri },
			OIDC_INIT_TTL_SECONDS
		)
		const signInUrl = makeAbsoluteServerUrl(`api/mobile/v1/auth/oidc/_jump?token=${encodeURIComponent(token)}`)

		return c.json({ challengeToken: token, ttlSeconds, signInUrl })
	})

	// =================================================================
	// GET /v1/auth/oidc/_jump (no auth)
	// =================================================================
	v1.get('/auth/oidc/_jump', rateLimit(mobileSignInLimiter), async c => {
		const token = c.req.query('token') ?? ''
		const pending = await peekPending(token, 'oidc-init')
		if (!pending) {
			return new Response('Sign-in link expired or invalid.', {
				status: 400,
				headers: { 'content-type': 'text/plain; charset=utf-8' },
			})
		}
		const provider = await configuredOidcProvider()
		if (!provider) {
			return new Response('Sign-in is not configured.', {
				status: 410,
				headers: { 'content-type': 'text/plain; charset=utf-8' },
			})
		}

		const callbackURL = makeAbsoluteServerUrl(`api/mobile/v1/auth/oidc/_native-done?token=${encodeURIComponent(token)}`)
		let signInResponse: Response
		try {
			signInResponse = await auth.api.signInWithOAuth2({
				body: {
					providerId: 'oidc',
					callbackURL,
					errorCallbackURL: callbackURL,
				},
				asResponse: true,
			})
		} catch (err) {
			oidcLog.error({ err }, 'signInWithOAuth2 failed')
			return new Response('Could not start sign-in. Please try again.', {
				status: 500,
				headers: { 'content-type': 'text/plain; charset=utf-8' },
			})
		}

		let target: string | null = null
		try {
			const json = (await signInResponse.clone().json()) as { url?: string }
			target = json.url ?? null
		} catch {
			target = null
		}
		if (!target) {
			oidcLog.error({ status: signInResponse.status }, 'no auth URL returned from signInWithOAuth2')
			return new Response('Sign-in temporarily unavailable.', {
				status: 502,
				headers: { 'content-type': 'text/plain; charset=utf-8' },
			})
		}

		const headers = new Headers({ Location: target })
		const setCookies = readSetCookies(signInResponse)
		for (const sc of setCookies) {
			headers.append('Set-Cookie', sc)
		}
		return new Response(null, { status: 302, headers })
	})

	// =================================================================
	// GET /v1/auth/oidc/_native-done (no auth)
	// =================================================================
	v1.get('/auth/oidc/_native-done', async c => {
		const token = c.req.query('token') ?? ''
		const pending = await peekPending(token, 'oidc-init')
		if (!pending) {
			return new Response('Sign-in link expired or invalid.', {
				status: 400,
				headers: { 'content-type': 'text/plain; charset=utf-8' },
			})
		}

		// Validate the redirect target against the admin-configured
		// whitelist again here. The admin could have removed the URI
		// between begin and now; failing closed is safer than bouncing
		// to a stale scheme.
		const provider = await configuredOidcProvider()
		if (!provider || !provider.mobileRedirectUris.includes(pending.redirectUri)) {
			oidcLog.warn({ token: token.slice(0, 8) }, 'redirectUri no longer allowed; failing the OIDC flow')
			await consumePending(token, 'oidc-init')
			return new Response('Sign-in completed but the redirect target is no longer allowed.', {
				status: 410,
				headers: { 'content-type': 'text/plain; charset=utf-8' },
			})
		}

		const errorParam = c.req.query('error')
		if (errorParam) {
			oidcLog.warn({ error: errorParam }, 'OIDC callback returned an error')
			await consumePending(token, 'oidc-init')
			return redirectToMobileScheme(pending.redirectUri, { error: errorParam })
		}

		const incomingCookie = c.req.header('cookie') ?? ''
		if (!incomingCookie) {
			oidcLog.warn('OIDC _native-done called without a session cookie')
			await consumePending(token, 'oidc-init')
			return redirectToMobileScheme(pending.redirectUri, { error: 'no-session' })
		}

		let userId: string | null = null
		try {
			const session = await auth.api.getSession({ headers: new Headers({ cookie: incomingCookie }) })
			userId = session?.user.id ?? null
		} catch (err) {
			oidcLog.error({ err }, 'getSession failed in _native-done')
			userId = null
		}
		if (!userId) {
			await consumePending(token, 'oidc-init')
			return redirectToMobileScheme(pending.redirectUri, { error: 'no-session' })
		}

		let created
		try {
			created = await auth.api.createApiKey({
				body: { name: pending.deviceName },
				headers: new Headers({ cookie: incomingCookie }),
			})
		} catch (err) {
			oidcLog.error({ err }, 'createApiKey failed in _native-done')
			await consumePending(token, 'oidc-init')
			return redirectToMobileScheme(pending.redirectUri, { error: 'apikey-failed' })
		}

		const userRow = await db.query.users.findFirst({
			where: (u, { eq: ueq }) => ueq(u.id, userId),
			columns: { id: true, name: true, email: true, image: true, role: true },
		})
		if (!userRow) {
			await consumePending(token, 'oidc-init')
			return redirectToMobileScheme(pending.redirectUri, { error: 'no-user' })
		}

		const envelope = {
			apiKey: created.key,
			user: {
				id: userRow.id,
				name: userRow.name,
				email: userRow.email,
				image: userRow.image,
				role: userRow.role,
				isAdmin: userRow.role === 'admin',
				isChild: userRow.role === 'child',
			},
			device: {
				id: created.id,
				prefix: created.prefix ?? null,
				name: created.name ?? null,
				createdAt: toIso(created.createdAt) ?? new Date().toISOString(),
				updatedAt: toIso(created.updatedAt) ?? new Date().toISOString(),
				lastRequest: toIso(created.lastRequest ?? null),
				expiresAt: toIso(created.expiresAt ?? null),
			},
		}

		const rotated = await rotatePending(token, { kind: 'oidc-result', envelope }, OIDC_RESULT_TTL_SECONDS)
		if (!rotated) {
			oidcLog.error({ token: token.slice(0, 8) }, 'rotatePending found no row to rotate')
			return redirectToMobileScheme(pending.redirectUri, { error: 'invalid-challenge' })
		}

		return redirectToMobileScheme(pending.redirectUri, { token })
	})

	// =================================================================
	// POST /v1/auth/oidc/finish (no auth)
	// =================================================================
	v1.post('/auth/oidc/finish', rateLimit(mobileSignInLimiter), async c => {
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = OidcFinishSchema.safeParse(body)
		if (!parsed.success) {
			return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		}
		const { challengeToken } = parsed.data

		const pending = await consumePending(challengeToken, 'oidc-result')
		if (!pending) {
			return jsonError(c, 400, 'invalid-challenge')
		}
		return c.json(pending.envelope)
	})
}

/**
 * Shared "promote a session cookie to an iOS apiKey envelope" helper.
 * Used by every flow that lands on a fresh better-auth session: TOTP,
 * passkey. Returns the standard `{ apiKey, user, device }` shape on
 * success, or jsonError(c, 401, fallbackCode) on any miss.
 */
async function mintEnvelopeFromSessionCookie(
	c: Context<MobileAuthContext>,
	sessionCookieHeader: string,
	deviceName: string,
	fallbackCode: string
): Promise<Response> {
	let userId: string | null = null
	try {
		const session = await auth.api.getSession({
			headers: new Headers({ cookie: sessionCookieHeader }),
		})
		userId = session?.user.id ?? null
	} catch {
		userId = null
	}
	if (!userId) {
		return jsonError(c, 401, fallbackCode)
	}

	const created = await auth.api.createApiKey({
		body: { name: deviceName },
		headers: new Headers({ cookie: sessionCookieHeader }),
	})

	const userRow = await db.query.users.findFirst({
		where: (u, { eq: ueq }) => ueq(u.id, userId),
		columns: {
			id: true,
			name: true,
			email: true,
			image: true,
			role: true,
		},
	})
	if (!userRow) return jsonError(c, 401, fallbackCode)

	return c.json({
		apiKey: created.key,
		user: {
			id: userRow.id,
			name: userRow.name,
			email: userRow.email,
			image: userRow.image,
			role: userRow.role,
			isAdmin: userRow.role === 'admin',
			isChild: userRow.role === 'child',
		},
		device: {
			id: created.id,
			prefix: created.prefix ?? null,
			name: created.name ?? null,
			createdAt: toIso(created.createdAt) ?? new Date().toISOString(),
			updatedAt: toIso(created.updatedAt) ?? new Date().toISOString(),
			lastRequest: toIso(created.lastRequest ?? null),
			expiresAt: toIso(created.expiresAt ?? null),
		},
	})
}

function makeAbsoluteServerUrl(pathAndQuery: string): string {
	const base = env.BETTER_AUTH_URL ?? env.SERVER_URL ?? 'http://localhost:3000'
	return new URL(pathAndQuery.replace(/^\/+/u, ''), base.endsWith('/') ? base : `${base}/`).toString()
}

/**
 * Build a 302 to the iOS-supplied redirect URI with the documented
 * query shape: `?token=...` on success, `?error=...` on failure.
 * `redirectUri` is the admin-whitelisted scheme already validated
 * upstream.
 */
function redirectToMobileScheme(redirectUri: string, params: { token?: string; error?: string }): Response {
	const target = new URL(redirectUri)
	if (params.token) target.searchParams.set('token', params.token)
	if (params.error) target.searchParams.set('error', params.error)
	return new Response(null, {
		status: 302,
		headers: { Location: target.toString() },
	})
}

function readSetCookies(res: Response): Array<string> {
	const headers = res.headers as unknown as { getSetCookie?: () => Array<string> } & Headers
	if (typeof headers.getSetCookie === 'function') {
		return headers.getSetCookie()
	}
	const single = res.headers.get('set-cookie')
	return single ? [single] : []
}

function toIso(value: Date | string | null | undefined): string | null {
	if (!value) return null
	return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
