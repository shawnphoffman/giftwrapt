// Item groups - the "or" / "order" sub-list construct that lets a list
// owner mark items as alternatives ("any one of these") or as an
// ordered sequence ("buy them in this order").

import { eq } from 'drizzle-orm'
import type { Hono } from 'hono'

import {
	AssignItemsInputSchema,
	assignItemsToGroupImpl,
	CreateGroupInputSchema,
	createItemGroupImpl,
	DeleteGroupInputSchema,
	deleteItemGroupImpl,
	getGroupsForListImpl,
	reorderGroupItemsImpl,
	ReorderGroupItemsInputSchema,
	UpdateGroupInputSchema,
	updateItemGroupImpl,
} from '@/api/_groups-impl'
import { db } from '@/db'
import { lists } from '@/db/schema'
import { canViewList } from '@/lib/permissions'

import type { MobileAuthContext } from '../auth'
import { jsonError } from '../envelope'

type App = Hono<MobileAuthContext>

export function registerGroupRoutes(v1: App): void {
	v1.get('/lists/:listId/groups', async c => {
		const userId = c.get('userId')
		const listId = Number(c.req.param('listId'))
		if (!Number.isFinite(listId) || listId <= 0) return jsonError(c, 400, 'invalid-id')
		// View permission gate (web does this in the route loader).
		const list = await db.query.lists.findFirst({
			where: eq(lists.id, listId),
			columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
		})
		if (!list) return jsonError(c, 404, 'not-found')
		if (list.ownerId !== userId) {
			const view = await canViewList(userId, list)
			if (!view.ok) return jsonError(c, 404, 'not-found')
		}
		const groups = await getGroupsForListImpl({ listId })
		return c.json({ groups })
	})

	v1.post('/lists/:listId/groups', async c => {
		const userId = c.get('userId')
		const listId = Number(c.req.param('listId'))
		if (!Number.isFinite(listId) || listId <= 0) return jsonError(c, 400, 'invalid-id')
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = CreateGroupInputSchema.safeParse({ ...(body as object), listId })
		if (!parsed.success) return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		const result = await createItemGroupImpl({ userId, input: parsed.data })
		if (result.kind === 'error') {
			const status = result.reason === 'not-found' ? 404 : 403
			return jsonError(c, status, result.reason)
		}
		return c.json({ group: result.group })
	})

	v1.patch('/groups/:groupId', async c => {
		const userId = c.get('userId')
		const groupId = Number(c.req.param('groupId'))
		if (!Number.isFinite(groupId) || groupId <= 0) return jsonError(c, 400, 'invalid-id')
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = UpdateGroupInputSchema.safeParse({ ...(body as object), groupId })
		if (!parsed.success) return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		const result = await updateItemGroupImpl({ userId, input: parsed.data })
		if (result.kind === 'error') {
			const status = result.reason === 'not-found' ? 404 : 403
			return jsonError(c, status, result.reason)
		}
		return c.json({ ok: true })
	})

	v1.delete('/groups/:groupId', async c => {
		const userId = c.get('userId')
		const groupId = Number(c.req.param('groupId'))
		if (!Number.isFinite(groupId) || groupId <= 0) return jsonError(c, 400, 'invalid-id')
		const parsed = DeleteGroupInputSchema.safeParse({ groupId })
		if (!parsed.success) return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		const result = await deleteItemGroupImpl({ userId, input: parsed.data })
		if (result.kind === 'error') {
			const status = result.reason === 'not-found' ? 404 : 403
			return jsonError(c, status, result.reason)
		}
		return c.json({ ok: true })
	})

	v1.post('/groups/:groupId/assign', async c => {
		const userId = c.get('userId')
		const groupId = Number(c.req.param('groupId'))
		if (!Number.isFinite(groupId) || groupId <= 0) return jsonError(c, 400, 'invalid-id')
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = AssignItemsInputSchema.safeParse({ ...(body as object), groupId })
		if (!parsed.success) return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		const result = await assignItemsToGroupImpl({ userId, input: parsed.data })
		if (result.kind === 'error') {
			if (result.reason === 'mixed-lists') return jsonError(c, 409, 'mixed-lists')
			const status = result.reason === 'not-found' ? 404 : 403
			return jsonError(c, status, result.reason)
		}
		return c.json({ ok: true })
	})

	v1.post('/groups/:groupId/reorder', async c => {
		const userId = c.get('userId')
		const groupId = Number(c.req.param('groupId'))
		if (!Number.isFinite(groupId) || groupId <= 0) return jsonError(c, 400, 'invalid-id')
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = ReorderGroupItemsInputSchema.safeParse({ ...(body as object), groupId })
		if (!parsed.success) return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		const result = await reorderGroupItemsImpl({ userId, input: parsed.data })
		if (result.kind === 'error') {
			const status = result.reason === 'not-found' ? 404 : 403
			return jsonError(c, status, result.reason)
		}
		return c.json({ ok: true })
	})
}
