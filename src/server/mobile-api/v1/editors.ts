// List editors - granting other users edit access on a list I own.

import { and, eq } from 'drizzle-orm'
import type { Hono } from 'hono'

import {
	AddEditorInputSchema,
	addListEditorImpl,
	getAddableEditorsImpl,
	getListEditorsImpl,
	removeListEditorImpl,
} from '@/api/_list-editors-impl'
import { db } from '@/db'
import { listEditors } from '@/db/schema'

import type { MobileAuthContext } from '../auth'
import { jsonError } from '../envelope'

type App = Hono<MobileAuthContext>

export function registerEditorRoutes(v1: App): void {
	v1.get('/lists/:listId/editors', async c => {
		const userId = c.get('userId')
		const listId = Number(c.req.param('listId'))
		if (!Number.isFinite(listId) || listId <= 0) return jsonError(c, 400, 'invalid-id')
		const editors = await getListEditorsImpl({ userId, listId })
		return c.json({ editors })
	})

	v1.get('/lists/:listId/editors/addable', async c => {
		const ownerId = c.get('userId')
		const listId = Number(c.req.param('listId'))
		if (!Number.isFinite(listId) || listId <= 0) return jsonError(c, 400, 'invalid-id')
		const users = await getAddableEditorsImpl({ ownerId, listId })
		return c.json({ users })
	})

	v1.post('/lists/:listId/editors', async c => {
		const ownerId = c.get('userId')
		const listId = Number(c.req.param('listId'))
		if (!Number.isFinite(listId) || listId <= 0) return jsonError(c, 400, 'invalid-id')
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = AddEditorInputSchema.safeParse({ ...(body as object), listId })
		if (!parsed.success) return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		const result = await addListEditorImpl({ ownerId, input: parsed.data })
		if (result.kind === 'error') {
			if (result.reason === 'list-not-found' || result.reason === 'user-not-found') {
				return jsonError(c, 404, result.reason)
			}
			if (result.reason === 'not-owner') return jsonError(c, 403, 'not-owner')
			return jsonError(c, 409, result.reason)
		}
		return c.json({ editor: result.editor })
	})

	// Mobile uses listId+userId in the URL; the impl takes the editor row
	// id, so we look it up first.
	v1.delete('/lists/:listId/editors/:userId', async c => {
		const ownerId = c.get('userId')
		const listId = Number(c.req.param('listId'))
		const targetUserId = c.req.param('userId')
		if (!Number.isFinite(listId) || listId <= 0) return jsonError(c, 400, 'invalid-id')
		if (!targetUserId) return jsonError(c, 400, 'invalid-id')
		const editor = await db.query.listEditors.findFirst({
			where: and(eq(listEditors.listId, listId), eq(listEditors.userId, targetUserId), eq(listEditors.ownerId, ownerId)),
			columns: { id: true },
		})
		if (!editor) return jsonError(c, 404, 'not-found')
		const result = await removeListEditorImpl({ ownerId, input: { editorId: editor.id } })
		if (result.kind === 'error') {
			const status = result.reason === 'not-found' ? 404 : 403
			return jsonError(c, status, result.reason)
		}
		return c.json({ ok: true })
	})
}
