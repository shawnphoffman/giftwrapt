// Item comments - threaded discussion on individual items, gated by
// list visibility. Only the comment author or the list owner can
// delete; only the author can edit.

import type { Hono } from 'hono'

import {
	CreateCommentInputSchema,
	createItemCommentImpl,
	DeleteCommentInputSchema,
	deleteItemCommentImpl,
	getCommentsForItemImpl,
	UpdateCommentInputSchema,
	updateItemCommentImpl,
} from '@/api/_comments-impl'
import { commentLimiter } from '@/lib/rate-limits'

import type { MobileAuthContext } from '../auth'
import { jsonError } from '../envelope'
import { rateLimit } from '../middleware'

type App = Hono<MobileAuthContext>

export function registerCommentRoutes(v1: App): void {
	v1.get('/items/:itemId/comments', async c => {
		const userId = c.get('userId')
		const itemId = Number(c.req.param('itemId'))
		if (!Number.isFinite(itemId) || itemId <= 0) return jsonError(c, 400, 'invalid-id')
		const comments = await getCommentsForItemImpl({ userId, itemId })
		return c.json({ comments })
	})

	v1.post('/items/:itemId/comments', rateLimit(commentLimiter), async c => {
		const userId = c.get('userId')
		const itemId = Number(c.req.param('itemId'))
		if (!Number.isFinite(itemId) || itemId <= 0) return jsonError(c, 400, 'invalid-id')
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = CreateCommentInputSchema.safeParse({ ...(body as object), itemId })
		if (!parsed.success) return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		const result = await createItemCommentImpl({ userId, input: parsed.data })
		if (result.kind === 'error') {
			if (result.reason === 'comments-disabled') return jsonError(c, 409, 'comments-disabled')
			return jsonError(c, 404, result.reason)
		}
		return c.json({ comment: result.comment })
	})

	v1.patch('/comments/:commentId', async c => {
		const userId = c.get('userId')
		const commentId = Number(c.req.param('commentId'))
		if (!Number.isFinite(commentId) || commentId <= 0) return jsonError(c, 400, 'invalid-id')
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = UpdateCommentInputSchema.safeParse({ ...(body as object), commentId })
		if (!parsed.success) return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		const result = await updateItemCommentImpl({ userId, input: parsed.data })
		if (result.kind === 'error') {
			const status = result.reason === 'not-found' ? 404 : 403
			return jsonError(c, status, result.reason)
		}
		return c.json({ ok: true })
	})

	v1.delete('/comments/:commentId', async c => {
		const userId = c.get('userId')
		const commentId = Number(c.req.param('commentId'))
		if (!Number.isFinite(commentId) || commentId <= 0) return jsonError(c, 400, 'invalid-id')
		const parsed = DeleteCommentInputSchema.safeParse({ commentId })
		if (!parsed.success) return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		const result = await deleteItemCommentImpl({ userId, input: parsed.data })
		if (result.kind === 'error') {
			const status = result.reason === 'not-found' ? 404 : 403
			return jsonError(c, status, result.reason)
		}
		return c.json({ ok: true })
	})
}
