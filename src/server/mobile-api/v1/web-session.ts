// `POST /v1/web-session` (plan 28, ADR 0003): mint a single-use handoff
// token so the iOS app's web tab can open a signed-in web session.
//
// The route is apiKey-authenticated like every other `/v1/*` route, so
// the kill switch, the ban check, and key verification have already run
// by the time the handler executes. It writes a `web-handoff` pending
// row bound to the calling user AND the calling key, with a 60-second
// TTL, and returns the absolute URL the web view must POST it to. iOS
// never builds web URLs itself.
//
// The token is the only credential that crosses from the apiKey surface
// to the cookie surface, and it travels by POST body only. The consume
// side (`src/lib/auth-plugins/mobile-web-handoff.ts`) re-checks the
// user, the ban state, the key, and the kill switch before it mints a
// one-day session. See docs/architecture/mobile-api.md (Web handoff).

import type { Hono } from 'hono'
import { z } from 'zod'

import { MOBILE_WEB_HANDOFF_PATH } from '@/lib/auth-plugins/mobile-web-handoff'
import { webHandoffLimiter } from '@/lib/rate-limits'
import { safeRedirect } from '@/lib/safe-redirect'

import type { MobileAuthContext } from '../auth'
import { createPending } from '../auth-pending'
import { jsonError } from '../envelope'
import { rateLimit } from '../middleware'
import { makeAbsoluteServerUrl } from './auth'

type App = Hono<MobileAuthContext>

export const WEB_HANDOFF_TTL_SECONDS = 60

const WebSessionInputSchema = z.object({
	// Same-origin path to land on after the handoff. Anything that is not
	// a plain path on this origin collapses to `/` via `safeRedirect`.
	to: z.string().max(2000).optional(),
})

export function registerWebSessionRoutes(v1: App): void {
	// Per-user limiter: `c.var.userId` is set by `requireMobileApiKey`,
	// so `rateLimit` keys on the user rather than the IP.
	v1.post('/web-session', rateLimit(webHandoffLimiter), async c => {
		const userId = c.get('userId')
		const apiKeyId = c.get('apiKeyId')

		let body: unknown = {}
		const raw = await c.req.text()
		if (raw.trim().length > 0) {
			try {
				body = JSON.parse(raw)
			} catch {
				return jsonError(c, 400, 'invalid-json')
			}
		}
		const parsed = WebSessionInputSchema.safeParse(body)
		if (!parsed.success) {
			return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		}

		const to = safeRedirect(parsed.data.to)
		const { token, ttlSeconds } = await createPending({ kind: 'web-handoff', userId, apiKeyId, to }, WEB_HANDOFF_TTL_SECONDS)
		return c.json({
			token,
			ttlSeconds,
			handoffUrl: makeAbsoluteServerUrl(`api/auth${MOBILE_WEB_HANDOFF_PATH}`),
		})
	})
}
