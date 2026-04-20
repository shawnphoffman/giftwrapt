import { redirect } from '@tanstack/react-router'
import { createMiddleware } from '@tanstack/react-start'
import { deleteCookie } from '@tanstack/react-start/server'
import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { users } from '@/db/schema'

import { auth } from '../lib/auth'

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

// Better-auth cookieCache can surface a session whose user row no longer exists
// (user deleted, session revoked, DB restored from backup, or in dev after a
// `db:reset` / `db:seed`). Without intervention the request loops: middleware
// trusts the cached cookie, loader hits the DB, finds nothing, redirects to
// /sign-in, sign-in's useSession reads the cached cookie, redirects back to /.
// Clear the cookies on the way to /sign-in so the client-side session state
// actually flips to signed-out.
async function requireLiveUser(userId: string): Promise<void> {
	const row = await db.query.users.findFirst({
		where: eq(users.id, userId),
		columns: { id: true },
	})
	if (!row) {
		clearAuthCookies()
		throw redirect({ to: '/sign-in' })
	}
}

export const authMiddleware = createMiddleware().server(async ({ next, request }) => {
	const session = await auth.api.getSession({ headers: request.headers })

	if (!session) {
		throw redirect({ to: '/sign-in' })
	}

	await requireLiveUser(session.user.id)

	return await next({
		context: {
			session,
		},
	})
})

export const adminAuthMiddleware = createMiddleware().server(async ({ next, request }) => {
	const session = await auth.api.getSession({ headers: request.headers })

	if (!session?.user.isAdmin) {
		throw redirect({ to: '/' })
	}

	await requireLiveUser(session.user.id)

	return await next({
		context: {
			session,
		},
	})
})
