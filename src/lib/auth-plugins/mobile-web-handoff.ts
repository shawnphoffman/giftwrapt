// better-auth plugin: `POST /api/auth/mobile-web-handoff` (plan 28, ADR 0003).
//
// The iOS app's web tab signs in by handoff, never by sharing a credential.
// iOS mints a token under its device apiKey (`POST /api/mobile/v1/web-session`),
// the WKWebView POSTs that token here, and this endpoint creates a one-day
// better-auth cookie session ("do not remember me" shape) and 302s to the
// requested path. The apiKey itself never becomes a session:
// `enableSessionForAPIKeys` stays off and apikey-no-session.integration.test.ts
// pins it. This route is the only bridge between the two credential surfaces,
// and it only ever runs from a single-use token that a live key just minted.
//
// Why a better-auth plugin rather than a Hono route on the mobile gateway:
// the session cookie has to be written with better-auth's own names,
// signing, prefix, cache chunking, and `tanstackStartCookies` handling.
// Going through `auth.handler` gives the endpoint a real better-auth
// context, so `setSessionCookie` does all of that; mirrors the upstream
// magic-link verify endpoint (node_modules/better-auth/dist/plugins/magic-link).
//
// Checks on consume, every one of them, in this order:
//   1. `consumePending(token, 'web-handoff')` succeeds (exists, not expired,
//      right kind). The row is deleted first, so a replay fails.
//   2. `enableMobileApp` is on. Flipping the kill switch stops new handoffs
//      at once; the last session ages out within a day.
//   3. The user row exists and `isUserBanned` is false.
//   4. The apikey row named by the token exists, belongs to the user, is
//      enabled, and is not expired. Revoking the device from the web
//      therefore stops the next handoff.
// Any miss is a plain 400 page, never a sign-in form: in embedded mode the
// web never shows one, and iOS treats a non-302 as a native error state.
//
// The browser's own CSRF defence still applies: better-auth's origin check
// runs on this POST whenever the request carries cookies (every handoff
// after the first), so the iOS request sets an `Origin` header matching
// the server. Tests run with the check disabled (better-auth's `isTest`).

import type { BetterAuthPlugin } from 'better-auth'
import { createAuthEndpoint } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { apikey, users } from '@/db/schema'
import { createLogger } from '@/lib/logger'
import { safeRedirect } from '@/lib/safe-redirect'
import { getAppSettings } from '@/lib/settings-loader'
import { isUserBanned } from '@/lib/user-ban'
import { consumePending } from '@/server/mobile-api/auth-pending'

const log = createLogger('mobile-web-handoff')

/** Path under better-auth's base path (`/api/auth`). */
export const MOBILE_WEB_HANDOFF_PATH = '/mobile-web-handoff'

const BodySchema = z.object({
	token: z.string().min(1).max(128),
	// Optional override of the path bound at mint time. Both go through
	// `safeRedirect`, so neither can leave the origin.
	to: z.string().max(2000).optional(),
})

const NO_STORE_HEADERS: Record<string, string> = {
	'cache-control': 'no-store',
	'referrer-policy': 'no-referrer',
	'content-type': 'text/plain; charset=utf-8',
}

function refused(reason: string, extra: Record<string, unknown> = {}): Response {
	log.warn({ reason, ...extra }, 'web handoff refused')
	return new Response('This sign-in link is no longer valid. Reopen the Lists tab in the GiftWrapt app.', {
		status: 400,
		headers: NO_STORE_HEADERS,
	})
}

export function mobileWebHandoff() {
	return {
		id: 'mobile-web-handoff',
		endpoints: {
			mobileWebHandoff: createAuthEndpoint(
				MOBILE_WEB_HANDOFF_PATH,
				{
					method: 'POST',
					body: BodySchema,
					metadata: {
						// The WKWebView submits the token as a form POST (a top-level
						// navigation, so the 302 and the cookie land in the web view
						// itself). better-auth's router defaults to JSON only.
						allowedMediaTypes: ['application/x-www-form-urlencoded', 'application/json'],
						openapi: {
							description: 'Exchange a single-use handoff token minted by the mobile API for a one-day web session.',
							responses: {
								302: { description: 'Session created; redirects to the requested path.' },
								400: { description: 'Token invalid, expired, replayed, or the device, user, or mobile app is no longer allowed.' },
							},
						},
					},
				},
				async ctx => {
					ctx.setHeader('Cache-Control', 'no-store')
					ctx.setHeader('Referrer-Policy', 'no-referrer')

					const pending = await consumePending(ctx.body.token, 'web-handoff')
					if (!pending) return refused('invalid-token')

					const settings = await getAppSettings(db)
					if (!settings.enableMobileApp) return refused('mobile-app-disabled', { userId: pending.userId })

					const userRows = await db
						.select({ id: users.id, banned: users.banned, banExpires: users.banExpires })
						.from(users)
						.where(eq(users.id, pending.userId))
						.limit(1)
					if (userRows.length === 0) return refused('user-missing', { userId: pending.userId })
					if (isUserBanned(userRows[0])) return refused('user-banned', { userId: pending.userId })

					const keyRows = await db
						.select({ id: apikey.id, enabled: apikey.enabled, expiresAt: apikey.expiresAt })
						.from(apikey)
						.where(and(eq(apikey.id, pending.apiKeyId), eq(apikey.userId, pending.userId)))
						.limit(1)
					if (keyRows.length === 0) return refused('key-missing', { userId: pending.userId, apiKeyId: pending.apiKeyId })
					const keyRow = keyRows[0]
					if (!keyRow.enabled) return refused('key-disabled', { userId: pending.userId, apiKeyId: pending.apiKeyId })
					if (keyRow.expiresAt && keyRow.expiresAt.getTime() <= Date.now()) {
						return refused('key-expired', { userId: pending.userId, apiKeyId: pending.apiKeyId })
					}

					const user = await ctx.context.internalAdapter.findUserById(pending.userId)
					if (!user) return refused('user-missing', { userId: pending.userId })

					// `true` is better-auth's "do not remember me": a 24-hour
					// session row and a cookie without max-age. The app
					// re-runs the handoff on every cold launch and every 12
					// hours while open, so the session never expires mid-use.
					const session = await ctx.context.internalAdapter.createSession(pending.userId, true)
					await setSessionCookie(ctx, { session, user }, true)

					const target = safeRedirect(ctx.body.to ?? pending.to)
					log.info({ userId: pending.userId, apiKeyId: pending.apiKeyId, to: target }, 'web handoff session created')
					throw ctx.redirect(new URL(target, ctx.context.baseURL).toString())
				}
			),
		},
	} satisfies BetterAuthPlugin
}
