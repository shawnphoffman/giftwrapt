// Item write surface beyond the basic create/update/delete (which live
// on `v1.ts` from the original v1 shipment). Singular and batch ops
// for the editor / owner experience: copy, archive, availability,
// batch move/archive/delete/priority/reorder, plus group priority and
// group-delete helpers that act on items inside a list.

import type { Hono } from 'hono'

import {
	archiveItemImpl,
	ArchiveItemInputSchema,
	archiveItemsImpl,
	ArchiveItemsInputSchema,
	CopyItemInputSchema,
	copyItemToListImpl,
	deleteGroupsImpl,
	DeleteGroupsInputSchema,
	deleteItemsImpl,
	DeleteItemsInputSchema,
	MoveItemsInputSchema,
	moveItemsToListImpl,
	ReorderEntriesInputSchema,
	reorderItemsImpl,
	ReorderItemsInputSchema,
	reorderListEntriesImpl,
	setGroupsPriorityImpl,
	SetGroupsPriorityInputSchema,
	setItemAvailabilityImpl,
	SetItemAvailabilityInputSchema,
	setItemsPriorityImpl,
	SetItemsPriorityInputSchema,
} from '@/api/_items-extra-impl'

import type { MobileAuthContext } from '../auth'
import { jsonError } from '../envelope'

type App = Hono<MobileAuthContext>

export function registerItemRoutes(v1: App): void {
	// ---------- Copy / archive / availability ----------

	v1.post('/items/:itemId/copy', async c => {
		const userId = c.get('userId')
		const itemId = Number(c.req.param('itemId'))
		if (!Number.isFinite(itemId) || itemId <= 0) return jsonError(c, 400, 'invalid-id')
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = CopyItemInputSchema.safeParse({ ...(body as object), itemId })
		if (!parsed.success) {
			return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		}
		const result = await copyItemToListImpl({ userId, input: parsed.data })
		if (result.kind === 'error') {
			const status = result.reason === 'not-authorized' ? 403 : 404
			return jsonError(c, status, result.reason)
		}
		return c.json({ item: result.item })
	})

	v1.post('/items/:itemId/archive', async c => {
		const userId = c.get('userId')
		const itemId = Number(c.req.param('itemId'))
		if (!Number.isFinite(itemId) || itemId <= 0) return jsonError(c, 400, 'invalid-id')
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = ArchiveItemInputSchema.safeParse({ ...(body as object), itemId })
		if (!parsed.success) {
			return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		}
		const result = await archiveItemImpl({ userId, input: parsed.data })
		if (result.kind === 'error') {
			const status = result.reason === 'not-found' ? 404 : 403
			return jsonError(c, status, result.reason)
		}
		return c.json({ ok: true })
	})

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

	v1.post('/items/batch/priority', async c => {
		const userId = c.get('userId')
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = SetItemsPriorityInputSchema.safeParse(body)
		if (!parsed.success) {
			return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		}
		const result = await setItemsPriorityImpl({ userId, input: parsed.data })
		if (result.kind === 'error') {
			const status = result.reason === 'not-found' ? 404 : 403
			return jsonError(c, status, result.reason)
		}
		return c.json({ updated: result.updated })
	})

	v1.post('/items/batch/reorder', async c => {
		const userId = c.get('userId')
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = ReorderItemsInputSchema.safeParse(body)
		if (!parsed.success) {
			return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		}
		const result = await reorderItemsImpl({ userId, input: parsed.data })
		if (result.kind === 'error') {
			if (result.reason === 'mixed-lists') return jsonError(c, 409, 'mixed-lists')
			const status = result.reason === 'not-found' ? 404 : 403
			return jsonError(c, status, result.reason)
		}
		return c.json({ updated: result.updated })
	})

	// ---------- Per-list helpers (mixed items+groups reorder, group bulk ops) ----------

	v1.post('/lists/:listId/reorder-entries', async c => {
		const userId = c.get('userId')
		const listId = Number(c.req.param('listId'))
		if (!Number.isFinite(listId) || listId <= 0) return jsonError(c, 400, 'invalid-id')
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = ReorderEntriesInputSchema.safeParse({ ...(body as object), listId })
		if (!parsed.success) {
			return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		}
		const result = await reorderListEntriesImpl({ userId, input: parsed.data })
		if (result.kind === 'error') {
			if (result.reason === 'mixed-lists') return jsonError(c, 409, 'mixed-lists')
			const status = result.reason === 'not-found' ? 404 : 403
			return jsonError(c, status, result.reason)
		}
		return c.json({ updatedItems: result.updatedItems, updatedGroups: result.updatedGroups })
	})

	v1.post('/lists/:listId/groups/priority', async c => {
		const userId = c.get('userId')
		const listId = Number(c.req.param('listId'))
		if (!Number.isFinite(listId) || listId <= 0) return jsonError(c, 400, 'invalid-id')
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = SetGroupsPriorityInputSchema.safeParse(body)
		if (!parsed.success) {
			return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		}
		const result = await setGroupsPriorityImpl({ userId, input: parsed.data })
		if (result.kind === 'error') {
			if (result.reason === 'mixed-lists') return jsonError(c, 409, 'mixed-lists')
			const status = result.reason === 'not-found' ? 404 : 403
			return jsonError(c, status, result.reason)
		}
		return c.json({ updated: result.updated })
	})

	v1.post('/lists/:listId/groups/delete', async c => {
		const userId = c.get('userId')
		const listId = Number(c.req.param('listId'))
		if (!Number.isFinite(listId) || listId <= 0) return jsonError(c, 400, 'invalid-id')
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = DeleteGroupsInputSchema.safeParse(body)
		if (!parsed.success) {
			return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		}
		const result = await deleteGroupsImpl({ userId, input: parsed.data })
		if (result.kind === 'error') {
			if (result.reason === 'mixed-lists') return jsonError(c, 409, 'mixed-lists')
			const status = result.reason === 'not-found' ? 404 : 403
			return jsonError(c, status, result.reason)
		}
		return c.json({ deletedGroups: result.deletedGroups, deletedItems: result.deletedItems })
	})
}
