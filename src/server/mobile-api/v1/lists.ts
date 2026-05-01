// Own-list management: the routes a list owner / editor uses to
// shape their own lists. Item-level write surface lives in `items.ts`.
//
//   POST   /v1/lists                       create
//   PATCH  /v1/lists/:listId               update
//   DELETE /v1/lists/:listId               delete (or force-archive when claims exist)
//   POST   /v1/lists/:listId/set-primary   toggle primary
//   GET    /v1/lists/:listId/edit          editor metadata + groups
//   GET    /v1/list-summaries?ids=1,2,3    bulk id->name lookup with privacy

import type { Hono } from 'hono'

import {
	createListImpl,
	CreateListInputSchema,
	deleteListImpl,
	getListForEditingImpl,
	getListSummariesImpl,
	GetListSummariesInputSchema,
	setPrimaryListImpl,
	SetPrimaryListInputSchema,
	updateListImpl,
	UpdateListInputSchema,
} from '@/api/_lists-impl'
import { db } from '@/db'

import type { MobileAuthContext } from '../auth'
import { jsonError } from '../envelope'

type App = Hono<MobileAuthContext>

export function registerListRoutes(v1: App): void {
	v1.post('/lists', async c => {
		const userId = c.get('userId')
		const isChild = c.get('userIsChild')
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = CreateListInputSchema.safeParse(body)
		if (!parsed.success) {
			return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		}
		const result = await createListImpl({ actor: { id: userId, isChild }, input: parsed.data })
		if (result.kind === 'error') {
			return jsonError(c, 403, result.reason)
		}
		return c.json({ list: result.list })
	})

	v1.patch('/lists/:listId', async c => {
		const userId = c.get('userId')
		const isChild = c.get('userIsChild')
		const listId = Number(c.req.param('listId'))
		if (!Number.isFinite(listId) || listId <= 0) return jsonError(c, 400, 'invalid-id')
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = UpdateListInputSchema.safeParse({ ...(body as object), listId })
		if (!parsed.success) {
			return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		}
		const result = await updateListImpl({ actor: { id: userId, isChild }, input: parsed.data })
		if (result.kind === 'error') {
			const status = result.reason === 'not-found' ? 404 : 403
			return jsonError(c, status, result.reason)
		}
		return c.json({ ok: true })
	})

	v1.delete('/lists/:listId', async c => {
		const userId = c.get('userId')
		const listId = Number(c.req.param('listId'))
		if (!Number.isFinite(listId) || listId <= 0) return jsonError(c, 400, 'invalid-id')
		const result = await deleteListImpl({ db, actor: { id: userId }, input: { listId } })
		if (result.kind === 'error') {
			const status = result.reason === 'not-found' ? 404 : 403
			return jsonError(c, status, result.reason)
		}
		return c.json({ ok: true, action: result.action })
	})

	v1.post('/lists/:listId/set-primary', async c => {
		const userId = c.get('userId')
		const listId = Number(c.req.param('listId'))
		if (!Number.isFinite(listId) || listId <= 0) return jsonError(c, 400, 'invalid-id')
		let body: unknown = {}
		try {
			body = await c.req.json()
		} catch {
			body = {}
		}
		const parsed = SetPrimaryListInputSchema.safeParse({ ...(body as object), listId })
		if (!parsed.success) {
			return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		}
		const result = await setPrimaryListImpl({ actor: { id: userId }, input: parsed.data })
		if (result.kind === 'error') {
			const status = result.reason === 'not-found' ? 404 : 403
			return jsonError(c, status, result.reason)
		}
		return c.json({ ok: true })
	})

	v1.get('/lists/:listId/edit', async c => {
		const userId = c.get('userId')
		const listId = c.req.param('listId')
		const result = await getListForEditingImpl({ userId, listId })
		if (result.kind === 'error') {
			const status = result.reason === 'not-found' ? 404 : 403
			return jsonError(c, status, result.reason)
		}
		return c.json({ list: result.list })
	})

	v1.get('/list-summaries', async c => {
		const userId = c.get('userId')
		const idsParam = c.req.query('ids') ?? ''
		const idList = idsParam
			.split(',')
			.map(s => Number(s.trim()))
			.filter(n => Number.isFinite(n) && n > 0)
		const parsed = GetListSummariesInputSchema.safeParse({ listIds: idList })
		if (!parsed.success) {
			return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		}
		const result = await getListSummariesImpl({ userId, input: parsed.data })
		return c.json(result)
	})
}
