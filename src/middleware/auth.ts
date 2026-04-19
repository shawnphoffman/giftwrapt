import { redirect } from '@tanstack/react-router'
import { createMiddleware } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { users } from '@/db/schema'

import { auth } from '../lib/auth'

// Better-auth cookieCache can surface a session whose user row no longer exists
// (e.g. after `pnpm db:reset` / `db:seed` truncates `users` while a signed-in
// browser still holds the cached cookie). Verify the user before trusting the
// id downstream — one indexed PK lookup, and only when a session is present.
async function requireLiveUser(userId: string): Promise<void> {
	const row = await db.query.users.findFirst({
		where: eq(users.id, userId),
		columns: { id: true },
	})
	if (!row) throw redirect({ to: '/sign-in' })
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
