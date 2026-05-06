// v1 of the mobile REST surface. Versioning rule: the wire contract of
// `/api/mobile/v1/*` is frozen. Breaking changes ship in `/api/mobile/v2/*`
// alongside; v1 stays running until we're confident no installed iOS
// client still pins to it.
//
// Each handler is a thin shim over an existing server-side impl in
// `src/api/*` so the mobile and web stacks share the actual data
// contracts. The shim translates apiKey-authenticated context into the
// shape each impl expects, and converts impl error variants to the
// verbose error envelope (see ./envelope.ts).

import { Hono } from 'hono'
import { z } from 'zod'

import { getItemsForListEditImpl } from '@/api/_items-extra-impl'
import { createItemImpl, CreateItemInputSchema, deleteItemImpl, updateItemImpl, UpdateItemInputSchema } from '@/api/_items-impl'
import { getMyListsImpl, getPublicListsImpl } from '@/api/_lists-impl'
import { db } from '@/db'
import { auth } from '@/lib/auth'
import { mobileSignInLimiter } from '@/lib/rate-limits'
import { runOneShotScrape } from '@/lib/scrapers/run'
import { LIMITS } from '@/lib/validation/limits'

import type { MobileAuthContext } from './auth'
import { requireMobileApiKey } from './auth'
import { createPending } from './auth-pending'
import { listDevicesForUserImpl, revokeAllDevicesImpl, revokeDeviceImpl } from './devices'
import { jsonError } from './envelope'
import { rateLimit } from './middleware'
import { registerAuthRoutes } from './v1/auth'

const v1 = new Hono<MobileAuthContext>()

// =====================================================================
// Public (no apiKey required)
// =====================================================================

const SignInInputSchema = z.object({
	email: z.string().email().max(LIMITS.EMAIL),
	password: z.string().min(1).max(LIMITS.PASSWORD),
	deviceName: z.string().min(1).max(LIMITS.SHORT_NAME),
})

// Forward Set-Cookie values from a better-auth response as a single
// `cookie:` request header so the next `auth.api.*` call can find the
// freshly-minted session. better-auth exposes Set-Cookies on the
// Response; we strip everything after the first `;` per cookie to
// turn server-side attributes (Path, HttpOnly, SameSite) into the
// pure `name=value` pairs the request side expects.
function setCookiesToCookieHeader(res: Response): string {
	const getSetCookie = (res.headers as unknown as { getSetCookie?: () => Array<string> }).getSetCookie
	const list = typeof getSetCookie === 'function' ? getSetCookie.call(res.headers) : []
	if (list.length === 0) {
		const single = res.headers.get('set-cookie')
		if (!single) return ''
		return single
			.split(',')
			.map(s => s.split(';')[0]?.trim())
			.filter(Boolean)
			.join('; ')
	}
	return list
		.map(sc => sc.split(';')[0]?.trim())
		.filter(Boolean)
		.join('; ')
}

// POST /v1/sign-in - validate email/password + mint a per-device apiKey.
//
// This is the ONLY blessed pairing flow for iOS. The user types
// credentials on first launch; the server returns `{apiKey, user, device}`
// and iOS stores `apiKey` in the keychain for every subsequent request.
// The user never sees the key.
v1.post('/sign-in', rateLimit(mobileSignInLimiter), async c => {
	// Kill switch is enforced at the gateway level (see app.ts);
	// requests that reach here have already passed it.

	let body: unknown
	try {
		body = await c.req.json()
	} catch {
		return jsonError(c, 400, 'invalid-json')
	}
	const parsed = SignInInputSchema.safeParse(body)
	if (!parsed.success) {
		return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
	}
	const { email, password, deviceName } = parsed.data

	// Validate credentials. `asResponse: true` returns a Response so we
	// can pull the Set-Cookie session header and forward it to the next
	// `auth.api.*` call. On bad creds better-auth throws an APIError
	// which we surface as a generic 401 so we don't leak whether the
	// email exists.
	let signInResponse: Response
	try {
		signInResponse = await auth.api.signInEmail({
			body: { email, password },
			asResponse: true,
		})
	} catch {
		return jsonError(c, 401, 'sign-in-failed')
	}
	if (signInResponse.status !== 200) {
		return jsonError(c, 401, 'sign-in-failed')
	}

	const cookieHeader = setCookiesToCookieHeader(signInResponse)
	if (!cookieHeader) {
		// Should never happen with correct better-auth config; fail
		// loudly so it surfaces in logs.
		return jsonError(c, 500, 'internal-error')
	}

	// 2FA fork: when the user has TOTP enrolled, better-auth's
	// twoFactor plugin replaces the post-sign-in body with
	// `{ twoFactorRedirect: true }` and the cookie above is the
	// short-lived 2FA-pending cookie (NOT a real session). We hold
	// that cookie under an opaque challenge token and hand the token
	// back to iOS; the client finishes via `POST /v1/auth/totp/verify`.
	let signInBody: unknown = null
	try {
		signInBody = await signInResponse.clone().json()
	} catch {
		// Response wasn't JSON. Fall through to the existing happy
		// path which reads the session.
	}
	const twoFactorPending =
		typeof signInBody === 'object' && signInBody !== null && (signInBody as { twoFactorRedirect?: unknown }).twoFactorRedirect === true
	if (twoFactorPending) {
		const TOTP_CHALLENGE_TTL_SECONDS = 300
		const { token, ttlSeconds } = await createPending(
			{ kind: 'totp', cookieHeader, deviceName: deviceName.trim() },
			TOTP_CHALLENGE_TTL_SECONDS
		)
		return c.json({
			challengeToken: token,
			ttlSeconds,
			methods: ['totp'],
		})
	}

	// Mint the per-device apiKey under the freshly-minted session. The
	// session itself is then thrown away (iOS never sees the cookie).
	let userId: string | null = null
	try {
		const session = await auth.api.getSession({
			headers: new Headers({ cookie: cookieHeader }),
		})
		userId = session?.user.id ?? null
	} catch {
		userId = null
	}
	if (!userId) {
		return jsonError(c, 401, 'sign-in-failed')
	}

	const created = await auth.api.createApiKey({
		body: { name: deviceName.trim() },
		headers: new Headers({ cookie: cookieHeader }),
	})

	const userRow = await db.query.users.findFirst({
		where: (u, { eq }) => eq(u.id, userId),
		columns: {
			id: true,
			name: true,
			email: true,
			image: true,
			role: true,
		},
	})
	if (!userRow) return jsonError(c, 401, 'sign-in-failed')

	function toIso(value: Date | string | null | undefined): string | null {
		if (!value) return null
		return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
	}

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

// Auth-extension routes are public (capabilities probe + TOTP
// challenge finish step). Register them before the apiKey middleware
// below so they're not gated on a key the user doesn't have yet.
registerAuthRoutes(v1)

// =====================================================================
// Authenticated (apiKey required from here down)
// =====================================================================

v1.use('*', requireMobileApiKey)

// GET /v1/me - the authenticated user's profile.
//
// Wire shape MUST stay byte-identical to the `user` block of
// `POST /v1/sign-in` (iOS widgets and the share extension cache `me`).
v1.get('/me', async c => {
	const userId = c.get('userId')
	const isAdmin = c.get('userIsAdmin')
	const isChild = c.get('userIsChild')
	const row = await db.query.users.findFirst({
		where: (u, { eq }) => eq(u.id, userId),
		columns: {
			id: true,
			name: true,
			email: true,
			image: true,
			role: true,
		},
	})
	if (!row) return jsonError(c, 404, 'not-found')
	return c.json({ ...row, isAdmin, isChild })
})

// GET /v1/me/devices - paired apiKeys for this user.
v1.get('/me/devices', async c => {
	const userId = c.get('userId')
	const callingApiKeyId = c.get('apiKeyId')
	const devices = await listDevicesForUserImpl(userId)
	return c.json({
		devices: devices.map(d => ({ ...d, isCurrent: d.id === callingApiKeyId })),
		nextCursor: null,
	})
})

// DELETE /v1/me/devices/:keyId - revoke a single device.
//
// Revoking the calling device is fine - the next request 401s and iOS
// treats that as the sign-out signal.
v1.delete('/me/devices/:keyId', async c => {
	const userId = c.get('userId')
	const keyId = c.req.param('keyId')
	if (!keyId) return jsonError(c, 400, 'invalid-id')
	const result = await revokeDeviceImpl(userId, keyId)
	if (result.kind === 'error') {
		return jsonError(c, 404, result.reason)
	}
	return c.json({ ok: true })
})

// DELETE /v1/me/devices - "log out everywhere": revoke all of this
// user's apiKeys, INCLUDING the calling device. iOS catches the next
// 401 as the signout signal.
v1.delete('/me/devices', async c => {
	const userId = c.get('userId')
	const result = await revokeAllDevicesImpl(userId)
	return c.json(result)
})

// GET /v1/lists - the authenticated user's lists.
v1.get('/lists', async c => {
	const userId = c.get('userId')
	const result = await getMyListsImpl(userId)
	return c.json(result)
})

// GET /v1/lists/public - axis-1 universe ("who can I shop for") for the
// All Lists tab and the Birthdays widget. Envelope reserves nextCursor
// for a future cursor without forcing a v2 bump; v1 always returns the
// full set and ignores any incoming ?cursor=.
v1.get('/lists/public', async c => {
	const userId = c.get('userId')
	const users = await getPublicListsImpl(userId)
	return c.json({ users, nextCursor: null })
})

// GET /v1/lists/:listId/items - items in a specific list (editor view),
// with optional archived inclusion. Distinct from
// `/v1/lists/:listId/view-items` (gifter view, includes claims).
v1.get('/lists/:listId/items', async c => {
	const userId = c.get('userId')
	const listId = c.req.param('listId')
	const includeArchived = c.req.query('includeArchived') === 'true'

	const result = await getItemsForListEditImpl({ userId, listId, includeArchived })
	if (result.kind === 'error') {
		const status = result.reason === 'not-found' ? 404 : 403
		return jsonError(c, status, result.reason)
	}
	return c.json({ items: result.items })
})

// PATCH /v1/items/:itemId - partial update of an item.
v1.patch('/items/:itemId', async c => {
	const userId = c.get('userId')
	const itemIdParam = Number(c.req.param('itemId'))
	if (!Number.isFinite(itemIdParam) || itemIdParam <= 0) {
		return jsonError(c, 400, 'invalid-id')
	}
	let body: unknown
	try {
		body = await c.req.json()
	} catch {
		return jsonError(c, 400, 'invalid-json')
	}
	const parsed = UpdateItemInputSchema.safeParse({
		...(body as object),
		itemId: itemIdParam,
	})
	if (!parsed.success) {
		return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
	}

	const result = await updateItemImpl({
		db,
		actor: { id: userId },
		input: parsed.data,
	})
	if (result.kind === 'error') {
		const status = result.reason === 'not-found' ? 404 : 403
		return jsonError(c, status, result.reason)
	}
	return c.json({ item: result.item })
})

// DELETE /v1/items/:itemId - hard delete an item.
v1.delete('/items/:itemId', async c => {
	const userId = c.get('userId')
	const itemIdParam = Number(c.req.param('itemId'))
	if (!Number.isFinite(itemIdParam) || itemIdParam <= 0) {
		return jsonError(c, 400, 'invalid-id')
	}
	const result = await deleteItemImpl({
		db,
		actor: { id: userId },
		input: { itemId: itemIdParam },
	})
	if (result.kind === 'error') {
		const status = result.reason === 'not-found' ? 404 : 403
		return jsonError(c, status, result.reason)
	}
	return c.json({ ok: true })
})

// POST /v1/items - create a new item.
v1.post('/items', async c => {
	const userId = c.get('userId')
	let body: unknown
	try {
		body = await c.req.json()
	} catch {
		return jsonError(c, 400, 'invalid-json')
	}
	const parsed = CreateItemInputSchema.safeParse(body)
	if (!parsed.success) {
		return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
	}

	const result = await createItemImpl({
		db,
		actor: { id: userId },
		input: parsed.data,
	})
	if (result.kind === 'error') {
		const status = result.reason === 'list-not-found' ? 404 : 403
		return jsonError(c, status, result.reason)
	}
	return c.json({ item: result.item })
})

// GET /v1/scrape?url=... - one-shot scrape used by the iOS share extension.
// Same orchestrator and providers as the web's `scrapeUrl` server fn;
// blocks for the final result instead of streaming per-attempt events.
//
// iOS uses this server-first; on 4xx/5xx or network failure it falls
// back to its local rough scraper.
v1.get('/scrape', async c => {
	const userId = c.get('userId')
	const url = c.req.query('url')
	if (!url) return jsonError(c, 400, 'missing-url')
	const force = c.req.query('force') === 'true'
	const acceptLanguage = c.req.header('accept-language') ?? undefined

	const result = await runOneShotScrape({
		url,
		userId,
		force,
		acceptLanguage,
		signal: c.req.raw.signal,
	})

	if (result.kind === 'error') {
		const status = result.reason === 'invalid-url' ? 400 : 502
		return jsonError(c, status, result.reason, { data: { attempts: result.attempts } })
	}
	return c.json({
		result: result.result,
		fromProvider: result.fromProvider,
		attempts: result.attempts,
		cached: result.cached,
	})
})

// =====================================================================
// Routes split by resource. Each module exports a `register*Routes`
// fn that attaches its handlers to the shared `v1` Hono instance.
// Order doesn't matter (Hono uses path-based matching), but we group
// related modules for readability.
// =====================================================================

import { registerAddonRoutes } from './v1/addons'
import { registerClaimRoutes } from './v1/claims'
import { registerCommentRoutes } from './v1/comments'
import { registerConfigRoutes } from './v1/config'
import { registerEditorRoutes } from './v1/editors'
import { registerGroupRoutes } from './v1/groups'
import { registerItemRoutes } from './v1/items'
import { registerListRoutes } from './v1/lists'
import { registerProfileRoutes } from './v1/profile'
import { registerRelationshipRoutes } from './v1/relationships'
import { registerUploadRoutes } from './v1/uploads'

registerClaimRoutes(v1)
registerListRoutes(v1)
registerItemRoutes(v1)
registerGroupRoutes(v1)
registerAddonRoutes(v1)
registerCommentRoutes(v1)
registerEditorRoutes(v1)
registerRelationshipRoutes(v1)
registerProfileRoutes(v1)
registerConfigRoutes(v1)
registerUploadRoutes(v1)

export { v1 }
