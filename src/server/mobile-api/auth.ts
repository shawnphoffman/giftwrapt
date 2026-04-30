// Hono middleware that authenticates a request using a better-auth
// API key. The mobile app sends `Authorization: Bearer <api-key>`;
// better-auth's apiKey plugin verifies the key against the `apikey`
// table. Keys are minted per-device (one per iOS install) and
// individually revocable from an admin UI - this is intentionally
// separate from the web's session cookie surface so a leaked mobile
// key can be killed without signing the user out of every browser
// session.
//
// Role lookup is a direct DB read off `result.key.userId` rather than
// a second `auth.api.getSession()` round-trip. getSession would re-run
// the apiKey plugin's `before` hook (re-hashing the bearer token,
// re-querying the apikey row, and incrementing requestCount a second
// time), doubling the per-key rate-limit cost on every mobile request.

import { eq } from 'drizzle-orm'
import type { Context, MiddlewareHandler } from 'hono'

import { db } from '@/db'
import { users } from '@/db/schema'
import { auth } from '@/lib/auth'

export interface MobileAuthContext {
	Variables: {
		userId: string
		userIsAdmin: boolean
		userIsChild: boolean
	}
}

export const requireMobileApiKey: MiddlewareHandler<MobileAuthContext> = async (c, next) => {
	const authHeader = c.req.header('authorization')
	if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
		return c.json({ error: 'unauthorized' }, 401)
	}
	const key = authHeader.slice(7).trim()
	if (!key) return c.json({ error: 'unauthorized' }, 401)

	const result = await auth.api.verifyApiKey({ body: { key } })
	if (!result.valid || !result.key) {
		return c.json({ error: 'unauthorized' }, 401)
	}

	const userId = result.key.userId
	const rows = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1)
	if (rows.length === 0) {
		return c.json({ error: 'unauthorized' }, 401)
	}
	const role = rows[0].role

	c.set('userId', userId)
	c.set('userIsAdmin', role === 'admin')
	c.set('userIsChild', role === 'child')
	return next()
}

export type MobileContext = Context<MobileAuthContext>
