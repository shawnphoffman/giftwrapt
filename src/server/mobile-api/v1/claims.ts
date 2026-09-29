// Gifter-side reads and co-gifter management (consumed by MCP).
//
//   GET    /v1/me/gifts                 -> my outgoing claims (read-only)
//   GET    /v1/lists/:listId/view-items -> items with claims (gifter view)
//   POST   /v1/gifts/:giftId/co-gifters -> add/remove co-gifters on a claim
//
// Each route is a thin shim over an `*Impl` in `src/api/*` so the web
// and mobile share the same code path.

import type { Hono } from 'hono'

import { getMyGiftsImpl, updateCoGiftersImpl, UpdateCoGiftersInputSchema } from '@/api/_gifts-impl'
import { getItemsForListViewImpl } from '@/api/_items-extra-impl'
import { db } from '@/db'

import type { MobileAuthContext } from '../auth'
import { jsonError } from '../envelope'

type App = Hono<MobileAuthContext>

const VALID_SORTS = new Set(['priority-asc', 'priority-desc', 'date-asc', 'date-desc'])

export function registerClaimRoutes(v1: App): void {
	// GET /v1/me/gifts - my outgoing claims, including ones where I'm
	// only a co-gifter. Narrower than `getPurchaseSummary`: no partner
	// purchases, no off-list addons. Use this for "what have I committed
	// to giving" surfaces (mobile gifts tab, MCP `list_my_claims`).
	v1.get('/me/gifts', async c => {
		const userId = c.get('userId')
		const gifts = await getMyGiftsImpl(db, userId)
		return c.json({ gifts })
	})

	// GET /v1/lists/:listId/view-items - items with claims (gifter view).
	v1.get('/lists/:listId/view-items', async c => {
		const userId = c.get('userId')
		const listId = c.req.param('listId')
		const sort = c.req.query('sort') ?? 'priority-desc'
		if (!VALID_SORTS.has(sort)) {
			return jsonError(c, 400, 'invalid-input', { data: { issues: [{ path: ['sort'], message: 'invalid sort' }] } })
		}
		const result = await getItemsForListViewImpl({ userId, listId, sort: sort as Parameters<typeof getItemsForListViewImpl>[0]['sort'] })
		if (result.kind === 'error') {
			const status = result.reason === 'is-owner' ? 409 : 404
			return jsonError(c, status, result.reason)
		}
		return c.json({ items: result.items })
	})

	// POST /v1/gifts/:giftId/co-gifters - manage co-gifters on a claim.
	// Only the original gifter can edit. Pass a full array of user ids
	// (replaces, not appends).
	v1.post('/gifts/:giftId/co-gifters', async c => {
		const gifterId = c.get('userId')
		const giftId = Number(c.req.param('giftId'))
		if (!Number.isFinite(giftId) || giftId <= 0) return jsonError(c, 400, 'invalid-id')
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = UpdateCoGiftersInputSchema.safeParse({ ...(body as object), giftId })
		if (!parsed.success) return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		const result = await updateCoGiftersImpl({ gifterId, input: parsed.data })
		if (result.kind === 'error') {
			const status = result.reason === 'not-found' ? 404 : 403
			return jsonError(c, status, result.reason)
		}
		return c.json({ additionalGifterIds: result.additionalGifterIds })
	})
}
