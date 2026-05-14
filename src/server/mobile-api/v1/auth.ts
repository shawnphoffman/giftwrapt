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
// `/v1/auth/{passkey,oidc}/{begin, _native-done, finish}` (no auth) -
// browser-driven sign-in. Both flows share the same shape:
//   1. iOS calls `<flow>/begin` and gets back `{ challengeToken, signInUrl }`.
//   2. iOS opens `signInUrl` in `ASWebAuthenticationSession`. The
//      passkey path lands on a stripped-down sign-in page that
//      invokes browser-native WebAuthn. The OIDC path 302s through
//      better-auth's `signInWithOAuth2` to the IdP and back.
//   3. Both flows converge on `_native-done`, which reads the
//      session cookie set by the in-app browser, mints an apiKey,
//      parks the `{ apiKey, user, device }` envelope under the
//      same challenge token, and 302s the browser at the
//      iOS-supplied `redirectUri` so the auth session returns
//      control to the app.
//   4. iOS posts `<flow>/finish` with the token to retrieve the envelope.
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
const passkeyLog = createLogger('mobile-api-passkey')

type App = Hono<MobileAuthContext>
type Flow = 'oidc' | 'passkey'

const VerifyTotpSchema = z.object({
	challengeToken: z.string().min(1).max(128),
	code: z.string().min(4).max(10),
})

const BrowserBeginSchema = z.object({
	deviceName: z.string().min(1).max(LIMITS.SHORT_NAME),
	// The custom URL scheme the iOS app registered for the redirect
	// leg. Validated against the admin-configured whitelist
	// (`mobileApp.redirectUris`) before any challenge token is
	// minted. The same whitelist gates both passkey and OIDC so
	// admins have one place to manage iOS app schemes.
	redirectUri: z.string().min(1).max(2000),
})

const BrowserFinishSchema = z.object({
	challengeToken: z.string().min(1).max(128),
})

const BROWSER_INIT_TTL_SECONDS = 600
const BROWSER_RESULT_TTL_SECONDS = 120

/**
 * Public-readable view of the configured OIDC provider. Reads from
 * `app_settings` live so the iOS capabilities probe always reflects
 * what the admin form last saved (the better-auth plugin still
 * requires a server restart to actually accept new sign-ins, but the
 * probe itself doesn't need to wait for that).
 */
async function configuredOidcProvider(): Promise<{ id: 'oidc'; label: string } | null> {
	try {
		const settings = await getAppSettings(db)
		const cfg = settings.oidcClient
		if (!cfg.enabled || !cfg.clientId || !cfg.clientSecret) return null
		const hasEndpoints = cfg.issuerUrl.length > 0 || (cfg.authorizationUrl.length > 0 && cfg.tokenUrl.length > 0)
		if (!hasEndpoints) return null
		return { id: 'oidc', label: cfg.buttonText.trim() || 'Sign in with OpenID' }
	} catch (err) {
		oidcLog.warn({ err }, 'reading OIDC client settings failed')
		return null
	}
}

/**
 * The single source of truth for "which iOS app schemes can we
 * redirect to". Both passkey and OIDC consult this; an empty list
 * means mobile sign-in via the browser flow isn't enabled. Admins
 * configure it under /admin/auth's Mobile app card. Fresh deployments
 * ship with the canonical iOS scheme so passkey is on by default.
 */
async function configuredMobileRedirectUris(): Promise<ReadonlyArray<string>> {
	try {
		const settings = await getAppSettings(db)
		return settings.mobileApp.redirectUris
	} catch {
		return []
	}
}

export function registerAuthRoutes(v1: App): void {
	// =================================================================
	// GET /v1/auth/capabilities (no auth)
	// =================================================================
	v1.get('/auth/capabilities', rateLimit(mobileSignInLimiter), async c => {
		const passwordEnabled = true
		const totpEnabled = true
		// Passkey is browser-driven now: it works as long as the
		// admin has configured at least one mobile redirect URI (which
		// also gates OIDC). Surface as `false` when nothing is on the
		// whitelist, so iOS hides the button instead of letting the
		// user tap into a "redirect-not-allowed" wall.
		const mobileRedirectUris = await configuredMobileRedirectUris()
		const passkeyEnabled = mobileRedirectUris.length > 0

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
	//
	// Stashes the deviceName + iOS redirect scheme under a challenge
	// token, returns a `signInUrl` pointing at `/sign-in/mobile-passkey`.
	// The page renders a stripped-down sign-in screen with only the
	// passkey button; tapping it triggers browser-native WebAuthn,
	// which authenticates against the SERVER's
	// `apple-app-site-association` (no app entitlement needed).
	v1.post('/auth/passkey/begin', rateLimit(mobileSignInLimiter), c => beginBrowserFlow(c, 'passkey'))

	// =================================================================
	// GET /v1/auth/passkey/_native-done (no auth)
	// =================================================================
	v1.get('/auth/passkey/_native-done', c => completeBrowserFlow(c, 'passkey'))

	// =================================================================
	// POST /v1/auth/passkey/finish (no auth)
	// =================================================================
	v1.post('/auth/passkey/finish', rateLimit(mobileSignInLimiter), c => finishBrowserFlow(c, 'passkey'))

	// =================================================================
	// POST /v1/auth/oidc/begin (no auth)
	// =================================================================
	v1.post('/auth/oidc/begin', rateLimit(mobileSignInLimiter), async c => {
		// Extra guard: OIDC needs a configured provider; passkey
		// only needs a redirect-URI whitelist.
		const provider = await configuredOidcProvider()
		if (!provider) {
			return jsonError(c, 404, 'oidc-not-configured')
		}
		return beginBrowserFlow(c, 'oidc')
	})

	// =================================================================
	// GET /v1/auth/oidc/_jump (no auth)
	// =================================================================
	v1.get('/auth/oidc/_jump', rateLimit(mobileSignInLimiter), async c => {
		const token = c.req.query('token') ?? ''
		const pending = await peekPending(token, 'browser-init')
		if (!pending || pending.flow !== 'oidc') {
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
				body: { providerId: 'oidc', callbackURL, errorCallbackURL: callbackURL },
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
	v1.get('/auth/oidc/_native-done', c => completeBrowserFlow(c, 'oidc'))

	// =================================================================
	// POST /v1/auth/oidc/finish (no auth)
	// =================================================================
	v1.post('/auth/oidc/finish', rateLimit(mobileSignInLimiter), c => finishBrowserFlow(c, 'oidc'))
}

// ===================================================================
// Shared browser-flow handlers (passkey + OIDC)
// ===================================================================

async function beginBrowserFlow(c: Context<MobileAuthContext>, flow: Flow): Promise<Response> {
	let body: unknown
	try {
		body = await c.req.json()
	} catch {
		return jsonError(c, 400, 'invalid-json')
	}
	const parsed = BrowserBeginSchema.safeParse(body)
	if (!parsed.success) {
		return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
	}
	const { deviceName, redirectUri } = parsed.data

	const allowed = await configuredMobileRedirectUris()
	if (!allowed.includes(redirectUri)) {
		return jsonError(c, 400, 'redirect-not-allowed', {
			message: 'redirectUri must match one of the admin-configured mobile redirect URIs.',
		})
	}

	const trimmedDeviceName = deviceName.trim().slice(0, LIMITS.SHORT_NAME)
	if (!trimmedDeviceName) {
		return jsonError(c, 400, 'invalid-input')
	}

	const { token, ttlSeconds } = await createPending(
		{ kind: 'browser-init', flow, deviceName: trimmedDeviceName, redirectUri },
		BROWSER_INIT_TTL_SECONDS
	)
	const signInUrl =
		flow === 'oidc'
			? makeAbsoluteServerUrl(`api/mobile/v1/auth/oidc/_jump?token=${encodeURIComponent(token)}`)
			: makeAbsoluteServerUrl(`sign-in/mobile-passkey?token=${encodeURIComponent(token)}`)

	return c.json({ challengeToken: token, ttlSeconds, signInUrl })
}

async function completeBrowserFlow(c: Context<MobileAuthContext>, flow: Flow): Promise<Response> {
	const log = flow === 'oidc' ? oidcLog : passkeyLog
	const token = c.req.query('token') ?? ''
	const pending = await peekPending(token, 'browser-init')
	if (!pending || pending.flow !== flow) {
		return new Response('Sign-in link expired or invalid.', {
			status: 400,
			headers: { 'content-type': 'text/plain; charset=utf-8' },
		})
	}

	// The admin could have removed the redirectUri from the whitelist
	// between begin and now. Fail closed.
	const allowed = await configuredMobileRedirectUris()
	if (!allowed.includes(pending.redirectUri)) {
		log.warn({ token: token.slice(0, 8) }, 'redirectUri no longer allowed; failing the flow')
		await consumePending(token, 'browser-init')
		return new Response('Sign-in completed but the redirect target is no longer allowed.', {
			status: 410,
			headers: { 'content-type': 'text/plain; charset=utf-8' },
		})
	}

	const errorParam = c.req.query('error')
	if (errorParam) {
		log.warn({ error: errorParam }, `${flow} callback returned an error`)
		await consumePending(token, 'browser-init')
		return redirectToMobileScheme(pending.redirectUri, { error: errorParam })
	}

	const incomingCookie = c.req.header('cookie') ?? ''
	if (!incomingCookie) {
		log.warn(`${flow} _native-done called without a session cookie`)
		await consumePending(token, 'browser-init')
		return redirectToMobileScheme(pending.redirectUri, { error: 'no-session' })
	}

	let userId: string | null = null
	try {
		const session = await auth.api.getSession({ headers: new Headers({ cookie: incomingCookie }) })
		userId = session?.user.id ?? null
	} catch (err) {
		log.error({ err }, 'getSession failed in _native-done')
		userId = null
	}
	if (!userId) {
		await consumePending(token, 'browser-init')
		return redirectToMobileScheme(pending.redirectUri, { error: 'no-session' })
	}

	let created
	try {
		created = await auth.api.createApiKey({
			body: { name: pending.deviceName },
			headers: new Headers({ cookie: incomingCookie }),
		})
	} catch (err) {
		log.error({ err }, 'createApiKey failed in _native-done')
		await consumePending(token, 'browser-init')
		return redirectToMobileScheme(pending.redirectUri, { error: 'apikey-failed' })
	}

	const userRow = await db.query.users.findFirst({
		where: (u, { eq: ueq }) => ueq(u.id, userId),
		columns: { id: true, name: true, email: true, image: true, role: true },
	})
	if (!userRow) {
		await consumePending(token, 'browser-init')
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

	const rotated = await rotatePending(token, { kind: 'browser-result', flow, envelope }, BROWSER_RESULT_TTL_SECONDS)
	if (!rotated) {
		log.error({ token: token.slice(0, 8) }, 'rotatePending found no row to rotate')
		return redirectToMobileScheme(pending.redirectUri, { error: 'invalid-challenge' })
	}

	return redirectToMobileScheme(pending.redirectUri, { token })
}

async function finishBrowserFlow(c: Context<MobileAuthContext>, flow: Flow): Promise<Response> {
	let body: unknown
	try {
		body = await c.req.json()
	} catch {
		return jsonError(c, 400, 'invalid-json')
	}
	const parsed = BrowserFinishSchema.safeParse(body)
	if (!parsed.success) {
		return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
	}
	const { challengeToken } = parsed.data

	const pending = await consumePending(challengeToken, 'browser-result')
	if (!pending || pending.flow !== flow) {
		return jsonError(c, 400, 'invalid-challenge')
	}
	return c.json(pending.envelope)
}

/**
 * Shared "promote a session cookie to an iOS apiKey envelope" helper.
 * Used by every flow that lands on a fresh better-auth session: TOTP,
 * passkey, OIDC. Returns the standard `{ apiKey, user, device }`
 * shape on success, or jsonError(c, 401, fallbackCode) on any miss.
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
		columns: { id: true, name: true, email: true, image: true, role: true },
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
	const base = env.BETTER_AUTH_URL ?? 'http://localhost:3000'
	return new URL(pathAndQuery.replace(/^\/+/u, ''), base.endsWith('/') ? base : `${base}/`).toString()
}

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
