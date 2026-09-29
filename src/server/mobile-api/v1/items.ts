// Item write surface beyond the basic create/update/delete (which live
// on `v1.ts` from the original v1 shipment): availability plus batch
// move/archive/delete, all consumed by MCP.

import type { Hono } from 'hono'

import {
	archiveItemsImpl,
	ArchiveItemsInputSchema,
	deleteItemsImpl,
	DeleteItemsInputSchema,
	MoveItemsInputSchema,
	moveItemsToListImpl,
	setItemAvailabilityImpl,
	SetItemAvailabilityInputSchema,
} from '@/api/_items-extra-impl'

import type { MobileAuthContext } from '../auth'
import { jsonError } from '../envelope'

type App = Hono<MobileAuthContext>

export function registerItemRoutes(v1: App): void {
	// ---------- Availability ----------

	v1.post('/items/:itemId/availability', async c => {
		const userId = c.get('userId')
		const itemId = Number(c.req.param('itemId'))
		if (!Number.isFinite(itemId) || itemId <= 0) return jsonError(c, 400, 'invalid-id')
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = SetItemAvailabilityInputSchema.safeParse({ ...(body as object), itemId })
		if (!parsed.success) {
			return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		}
		const result = await setItemAvailabilityImpl({ userId, input: parsed.data })
		if (result.kind === 'error') {
			return jsonError(c, 404, result.reason)
		}
		return c.json({ item: result.item })
	})

	// ---------- Batch ops ----------

	v1.post('/items/batch/move', async c => {
		const userId = c.get('userId')
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = MoveItemsInputSchema.safeParse(body)
		if (!parsed.success) {
			return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		}
		const result = await moveItemsToListImpl({ userId, input: parsed.data })
		if (result.kind === 'error') {
			const status = result.reason === 'not-found' ? 404 : 403
			return jsonError(c, status, result.reason)
		}
		return c.json(result)
	})

	v1.post('/items/batch/archive', async c => {
		const userId = c.get('userId')
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = ArchiveItemsInputSchema.safeParse(body)
		if (!parsed.success) {
			return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		}
		const result = await archiveItemsImpl({ userId, input: parsed.data })
		if (result.kind === 'error') {
			const status = result.reason === 'not-found' ? 404 : 403
			return jsonError(c, status, result.reason)
		}
		return c.json({ updated: result.updated })
	})

	v1.post('/items/batch/delete', async c => {
		const userId = c.get('userId')
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = DeleteItemsInputSchema.safeParse(body)
		if (!parsed.success) {
			return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		}
		const result = await deleteItemsImpl({ userId, input: parsed.data })
		if (result.kind === 'error') {
			const status = result.reason === 'not-found' ? 404 : 403
			return jsonError(c, status, result.reason)
		}
		return c.json({ deleted: result.deleted })
	})
}
