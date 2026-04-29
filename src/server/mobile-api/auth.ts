// Hono middleware that authenticates a request using a better-auth
// API key. The mobile app sends `Authorization: Bearer <api-key>`;
// better-auth's apiKey plugin verifies the key against the `apikey`
// table and returns the associated session. Keys are minted per-device
// (one per iOS install) and individually revocable from an admin UI -
// this is intentionally separate from the web's session cookie surface
// so a leaked mobile key can be killed without signing the user out
// of every browser session.

import type { Context, MiddlewareHandler } from 'hono'

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

	// Look up the user the key is bound to. Admin/child flags drive
	// route-level authorization decisions inside individual handlers.
	const session = await auth.api.getSession({
		headers: new Headers({ 'x-api-key': key }),
	})
	if (!session?.user.id) {
		return c.json({ error: 'unauthorized' }, 401)
	}

	c.set('userId', session.user.id)
	c.set('userIsAdmin', session.user.isAdmin)
	c.set('userIsChild', session.user.isChild)
	return next()
}

export type MobileContext = Context<MobileAuthContext>
