// Mobile auth-extension routes.
//
// `/v1/auth/capabilities` (no auth) - tells iOS which sign-in methods
// the deployment supports so the client can render the right UI
// without learning about better-auth plugin names.
//
// `/v1/auth/totp/verify` (no auth, opaque challenge token) - the
// finish step for the 2FA fork that `POST /v1/sign-in` opens when
// the password-validated user has TOTP enrolled. See
// `.notes/plans/2026-05-mobile-auth-extensions.md`.

import { eq } from 'drizzle-orm'
import type { Hono } from 'hono'
import { z } from 'zod'

import { db } from '@/db'
import { oauthApplication } from '@/db/schema'
import { auth } from '@/lib/auth'
import { mobileSignInLimiter } from '@/lib/rate-limits'
import { LIMITS } from '@/lib/validation/limits'

import type { MobileAuthContext } from '../auth'
import { consumePending } from '../auth-pending'
import { mergeSetCookiesToCookieHeader } from '../cookies'
import { jsonError } from '../envelope'
import { rateLimit } from '../middleware'

type App = Hono<MobileAuthContext>

const VerifyTotpSchema = z.object({
	challengeToken: z.string().min(1).max(128),
	// TOTP codes are 6 digits today; allow 6-10 to leave room for
	// future configurations (HOTP, longer codes) without forcing a v2.
	code: z.string().min(4).max(10),
})

export function registerAuthRoutes(v1: App): void {
	// =================================================================
	// GET /v1/auth/capabilities (no auth)
	// =================================================================
	//
	// Deployment-level discovery so iOS knows which sign-in affordances
	// to render. Cached by iOS per host. Don't put any user-specific
	// information here; this is read by anyone who knows the host URL.
	v1.get('/auth/capabilities', rateLimit(mobileSignInLimiter), async c => {
		// `password` is hard-true for now: every deployment has email
		// + password enabled (auth.ts has no escape hatch). Encoded as
		// a value rather than `true` literal so a future env-driven
		// disable doesn't require an iOS bump.
		const passwordEnabled = true
		const totpEnabled = true
		const passkeyEnabled = true

		const oidcRows = await db
			.select({
				clientId: oauthApplication.clientId,
				name: oauthApplication.name,
			})
			.from(oauthApplication)
			.where(eq(oauthApplication.disabled, false))

		return c.json({
			password: passwordEnabled,
			totp: totpEnabled,
			passkey: passkeyEnabled,
			oidc: oidcRows.map(r => ({
				id: r.clientId,
				label: r.name,
				// v1 doesn't try to fingerprint provider type. iOS
				// renders a generic OIDC button for each row. When we
				// wire google/apple as first-class buttons later, the
				// server will compute `kind` from a column we add then.
				kind: 'generic' as const,
			})),
		})
	})

	// =================================================================
	// POST /v1/auth/totp/verify (no auth - opaque challenge token)
	// =================================================================
	//
	// Finish step for the 2FA fork. iOS calls this after `POST /sign-in`
	// returned `{ challengeToken, ttlSeconds, methods: ['totp'] }`.
	// Single-use: the challenge token is consumed before we call
	// better-auth, so a wrong code burns the token and forces the user
	// back to the password step.
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
		// Bound the deviceName the same way `/sign-in` does on input;
		// the value came from a previous trusted body but we still
		// trim before handing it back to better-auth.
		const deviceName = pending.deviceName.trim().slice(0, LIMITS.SHORT_NAME)
		if (!deviceName) {
			return jsonError(c, 500, 'internal-error')
		}

		// Restore the 2FA-pending cookie so better-auth's verifyTOTP
		// recognizes the in-progress sign-in. `asResponse: true` lets
		// us pull the freshly-minted real session cookie out of the
		// Set-Cookie header.
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

		// Same sequence the `/sign-in` happy path uses: read the user
		// id off the session, then mint the apiKey under that session.
		let userId: string | null = null
		try {
			const session = await auth.api.getSession({
				headers: new Headers({ cookie: realCookieHeader }),
			})
			userId = session?.user.id ?? null
		} catch {
			userId = null
		}
		if (!userId) {
			return jsonError(c, 401, 'invalid-code')
		}

		const created = await auth.api.createApiKey({
			body: { name: deviceName },
			headers: new Headers({ cookie: realCookieHeader }),
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
		if (!userRow) return jsonError(c, 401, 'invalid-code')

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
	})
}

function toIso(value: Date | string | null | undefined): string | null {
	if (!value) return null
	return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
