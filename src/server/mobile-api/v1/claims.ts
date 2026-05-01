// Gifter flow: open someone else's list, claim items, manage co-gifters.
//
//   GET    /v1/lists/:listId            -> list metadata + addons + groups
//   GET    /v1/lists/:listId/view-items -> items with claims (gifter view)
//   POST   /v1/items/:itemId/claim      -> claim quantity on an item
//   PATCH  /v1/gifts/:giftId            -> edit my own claim
//   DELETE /v1/gifts/:giftId            -> unclaim (hard delete)
//   POST   /v1/gifts/:giftId/co-gifters -> add/remove co-gifters on a claim
//
// Each route is a thin shim over an `*Impl` in `src/api/*` so the web
// and mobile share the same code path.

import type { Hono } from 'hono'

import {
	ClaimGiftInputSchema,
	claimItemGiftImpl,
	UnclaimGiftInputSchema,
	unclaimItemGiftImpl,
	updateCoGiftersImpl,
	UpdateCoGiftersInputSchema,
	UpdateGiftInputSchema,
	updateItemGiftImpl,
} from '@/api/_gifts-impl'
import { getItemsForListViewImpl } from '@/api/_items-extra-impl'
import { getListForViewingImpl } from '@/api/_lists-impl'
import { claimLimiter } from '@/lib/rate-limits'

import type { MobileAuthContext } from '../auth'
import { jsonError } from '../envelope'
import { rateLimit } from '../middleware'

type App = Hono<MobileAuthContext>

const VALID_SORTS = new Set(['priority-asc', 'priority-desc', 'date-asc', 'date-desc'])

export function registerClaimRoutes(v1: App): void {
	// GET /v1/lists/:listId - viewing metadata for someone else's list.
	v1.get('/lists/:listId', async c => {
		const userId = c.get('userId')
		const listId = c.req.param('listId')
		const result = await getListForViewingImpl({ userId, listId })
		if (!result) return jsonError(c, 404, 'not-found')
		if (result.kind === 'redirect') {
			return jsonError(c, 409, 'is-owner', { data: { listId: result.listId } })
		}
		return c.json({ list: result.list })
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

	// POST /v1/items/:itemId/claim - claim quantity on an item.
	v1.post('/items/:itemId/claim', rateLimit(claimLimiter), async c => {
		const gifterId = c.get('userId')
		const itemId = Number(c.req.param('itemId'))
		if (!Number.isFinite(itemId) || itemId <= 0) return jsonError(c, 400, 'invalid-id')

		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}

		const parsed = ClaimGiftInputSchema.safeParse({ ...(body as object), itemId })
		if (!parsed.success) {
			return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		}

		const result = await claimItemGiftImpl({ gifterId, input: parsed.data })
		if (result.kind === 'error') {
			if (result.reason === 'item-not-found' || result.reason === 'not-visible') {
				return jsonError(c, 404, result.reason)
			}
			if (result.reason === 'over-claim') {
				return jsonError(c, 409, 'over-claim', { data: { remaining: result.remaining } })
			}
			if (result.reason === 'group-already-claimed' || result.reason === 'group-out-of-order') {
				return jsonError(c, 409, result.reason, {
					data: result.blockingItemTitle ? { blockingItemTitle: result.blockingItemTitle } : undefined,
				})
			}
			return jsonError(c, 409, result.reason)
		}
		return c.json({ gift: result.gift })
	})

	// PATCH /v1/gifts/:giftId - edit my own claim.
	v1.patch('/gifts/:giftId', rateLimit(claimLimiter), async c => {
		const gifterId = c.get('userId')
		const giftId = Number(c.req.param('giftId'))
		if (!Number.isFinite(giftId) || giftId <= 0) return jsonError(c, 400, 'invalid-id')

		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}

		const parsed = UpdateGiftInputSchema.safeParse({ ...(body as object), giftId })
		if (!parsed.success) {
			return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		}

		const result = await updateItemGiftImpl({ gifterId, input: parsed.data })
		if (result.kind === 'error') {
			if (result.reason === 'over-claim') {
				return jsonError(c, 409, 'over-claim', { data: { remaining: result.remaining } })
			}
			const status = result.reason === 'not-found' ? 404 : 403
			return jsonError(c, status, result.reason)
		}
		return c.json({ gift: result.gift })
	})

	// DELETE /v1/gifts/:giftId - unclaim (hard delete).
	v1.delete('/gifts/:giftId', rateLimit(claimLimiter), async c => {
		const gifterId = c.get('userId')
		const giftId = Number(c.req.param('giftId'))
		if (!Number.isFinite(giftId) || giftId <= 0) return jsonError(c, 400, 'invalid-id')

		const parsed = UnclaimGiftInputSchema.safeParse({ giftId })
		if (!parsed.success) {
			return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		}

		const result = await unclaimItemGiftImpl({ gifterId, input: parsed.data })
		if (result.kind === 'error') {
			const status = result.reason === 'not-found' ? 404 : 403
			return jsonError(c, status, result.reason)
		}
		return c.json({ ok: true })
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
