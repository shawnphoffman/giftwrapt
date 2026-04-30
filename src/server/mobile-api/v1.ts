// v1 of the mobile REST surface. Versioning rule: the wire contract of
// `/api/mobile/v1/*` is frozen. Breaking changes ship in `/api/mobile/v2/*`
// alongside; v1 stays running until we're confident no installed iOS
// client still pins to it.
//
// Each handler is a thin shim over an existing server-side impl in
// `src/api/*` so the mobile and web stacks share the actual data
// contracts. The shim translates apiKey-authenticated context into the
// shape each impl expects, and converts impl error variants to HTTP
// status codes.

import { Hono } from 'hono'

import { createItemImpl, CreateItemInputSchema, deleteItemImpl, updateItemImpl, UpdateItemInputSchema } from '@/api/_items-impl'
import { getItemsForListEditImpl } from '@/api/items'
import { getMyListsImpl, getPublicListsImpl } from '@/api/lists'
import { db } from '@/db'
import { runOneShotScrape } from '@/lib/scrapers/run'

import type { MobileAuthContext } from './auth'
import { requireMobileApiKey } from './auth'

const v1 = new Hono<MobileAuthContext>()

v1.use('*', requireMobileApiKey)

// GET /v1/me - the authenticated user's profile.
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
	if (!row) return c.json({ error: 'user-not-found' }, 404)
	return c.json({ ...row, isAdmin, isChild })
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

// GET /v1/lists/:listId/items - items in a specific list, with optional archived inclusion.
v1.get('/lists/:listId/items', async c => {
	const userId = c.get('userId')
	const listId = c.req.param('listId')
	const includeArchived = c.req.query('includeArchived') === 'true'

	const result = await getItemsForListEditImpl({ userId, listId, includeArchived })
	if (result.kind === 'error') {
		const status = result.reason === 'not-found' ? 404 : 403
		return c.json({ error: result.reason }, status)
	}
	return c.json({ items: result.items })
})

// PATCH /v1/items/:itemId - partial update of an item.
v1.patch('/items/:itemId', async c => {
	const userId = c.get('userId')
	const itemIdParam = Number(c.req.param('itemId'))
	if (!Number.isFinite(itemIdParam) || itemIdParam <= 0) {
		return c.json({ error: 'invalid-id' }, 400)
	}
	let body: unknown
	try {
		body = await c.req.json()
	} catch {
		return c.json({ error: 'invalid-json' }, 400)
	}
	const parsed = UpdateItemInputSchema.safeParse({
		...(body as object),
		itemId: itemIdParam,
	})
	if (!parsed.success) {
		return c.json({ error: 'invalid-input', issues: parsed.error.issues }, 400)
	}

	const result = await updateItemImpl({
		db,
		actor: { id: userId },
		input: parsed.data,
	})
	if (result.kind === 'error') {
		const status = result.reason === 'not-found' ? 404 : 403
		return c.json({ error: result.reason }, status)
	}
	return c.json({ item: result.item })
})

// DELETE /v1/items/:itemId - hard delete an item.
v1.delete('/items/:itemId', async c => {
	const userId = c.get('userId')
	const itemIdParam = Number(c.req.param('itemId'))
	if (!Number.isFinite(itemIdParam) || itemIdParam <= 0) {
		return c.json({ error: 'invalid-id' }, 400)
	}
	const result = await deleteItemImpl({
		db,
		actor: { id: userId },
		input: { itemId: itemIdParam },
	})
	if (result.kind === 'error') {
		const status = result.reason === 'not-found' ? 404 : 403
		return c.json({ error: result.reason }, status)
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
		return c.json({ error: 'invalid-json' }, 400)
	}
	const parsed = CreateItemInputSchema.safeParse(body)
	if (!parsed.success) {
		return c.json({ error: 'invalid-input', issues: parsed.error.issues }, 400)
	}

	const result = await createItemImpl({
		db,
		actor: { id: userId },
		input: parsed.data,
	})
	if (result.kind === 'error') {
		const status = result.reason === 'list-not-found' ? 404 : 403
		return c.json({ error: result.reason }, status)
	}
	return c.json({ item: result.item })
})

// GET /v1/scrape?url=... - one-shot scrape used by the iOS share extension.
// Same orchestrator and providers as the web's `scrapeUrl` server fn;
// blocks for the final result instead of streaming per-attempt events.
v1.get('/scrape', async c => {
	const userId = c.get('userId')
	const url = c.req.query('url')
	if (!url) return c.json({ error: 'missing-url' }, 400)
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
		return c.json({ error: result.reason, attempts: result.attempts }, status)
	}
	return c.json({
		result: result.result,
		fromProvider: result.fromProvider,
		attempts: result.attempts,
		cached: result.cached,
	})
})

export { v1 }
