import { redirect } from '@tanstack/react-router'
import { createMiddleware } from '@tanstack/react-start'
import { deleteCookie } from '@tanstack/react-start/server'
import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { users } from '@/db/schema'
import { createLogger } from '@/lib/logger'
import { runWithRequest, setRequestUser } from '@/lib/request-context'

import { auth } from '../lib/auth'

const mwLog = createLogger('middleware:auth')

// Better-auth's default cookie names. The __Secure- prefixed pair is what's
// actually set in production (over HTTPS). Clear both sets so we don't leave
// a live cookie behind after a ghost-session redirect.
const AUTH_COOKIE_NAMES = [
	'better-auth.session_token',
	'better-auth.session_data',
	'__Secure-better-auth.session_token',
	'__Secure-better-auth.session_data',
]

function clearAuthCookies(): void {
	for (const name of AUTH_COOKIE_NAMES) deleteCookie(name, { path: '/' })
}

// Build a `?redirect=<original-url>` so the share-target round-trips through
// sign-in (e.g. /me?url=... or /import?url=... arriving while signed out).
// Returns `undefined` when the user was already heading to `/`, since that's
// where they'd land post-auth anyway.
function buildSignInSearch(request: Request): { redirect?: string } {
	try {
		const u = new URL(request.url)
		const target = `${u.pathname}${u.search}${u.hash}`
		if (!target || target === '/') return {}
		return { redirect: target }
	} catch {
		return {}
	}
}

// Better-auth cookieCache can surface a session whose user row no longer exists
// (user deleted, session revoked, DB restored from backup, or in dev after a
// `db:reset` / `db:seed`). Without intervention the request loops: middleware
// trusts the cached cookie, loader hits the DB, finds nothing, redirects to
// /sign-in, sign-in's useSession reads the cached cookie, redirects back to /.
// Clear the cookies on the way to /sign-in so the client-side session state
// actually flips to signed-out.
//
// Cached per warm serverless instance for 10 minutes to match better-auth's
// cookieCache.refreshCache.updateAge window. Cold starts revalidate naturally.
const LIVE_USER_TTL_MS = 10 * 60 * 1000
const liveUserCache = new Map<string, number>()

async function requireLiveUser(userId: string, request: Request): Promise<void> {
	const now = Date.now()
	const cached = liveUserCache.get(userId)
	if (cached && cached > now) return

	const row = await db.query.users.findFirst({
		where: eq(users.id, userId),
		columns: { id: true },
	})
	if (!row) {
		liveUserCache.delete(userId)
		mwLog.warn({ userId }, 'session user no longer exists, clearing cookies')
		clearAuthCookies()
		throw redirect({ to: '/sign-in', search: buildSignInSearch(request) })
	}
	liveUserCache.set(userId, now + LIVE_USER_TTL_MS)
}

export const authMiddleware = createMiddleware().server(async ({ next, request }) => {
	return runWithRequest(request, async () => {
		const session = await auth.api.getSession({ headers: request.headers })

		if (!session) {
			mwLog.debug('unauthenticated, redirecting to /sign-in')
			throw redirect({ to: '/sign-in', search: buildSignInSearch(request) })
		}

		setRequestUser(session.user.id)
		await requireLiveUser(session.user.id, request)

		return await next({
			context: {
				session,
			},
		})
	})
})

export const adminAuthMiddleware = createMiddleware().server(async ({ next, request }) => {
	return runWithRequest(request, async () => {
		const session = await auth.api.getSession({ headers: request.headers })

		if (!session?.user.isAdmin) {
			mwLog.warn({ hasSession: Boolean(session) }, 'admin check failed, redirecting')
			throw redirect({ to: '/' })
		}

		setRequestUser(session.user.id)
		await requireLiveUser(session.user.id, request)

		return await next({
			context: {
				session,
			},
		})
	})
})
