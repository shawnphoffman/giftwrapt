// List addons - gifter-contributed off-list items ("I got them
// something they didn't ask for"). Visible only to gifters; the list
// owner can't see them.

import type { Hono } from 'hono'

import {
	ArchiveAddonInputSchema,
	archiveListAddonImpl,
	CreateAddonInputSchema,
	createListAddonImpl,
	DeleteAddonInputSchema,
	deleteListAddonImpl,
	UpdateAddonInputSchema,
	updateListAddonImpl,
} from '@/api/_list-addons-impl'

import type { MobileAuthContext } from '../auth'
import { jsonError } from '../envelope'

type App = Hono<MobileAuthContext>

export function registerAddonRoutes(v1: App): void {
	v1.post('/lists/:listId/addons', async c => {
		const userId = c.get('userId')
		const listId = Number(c.req.param('listId'))
		if (!Number.isFinite(listId) || listId <= 0) return jsonError(c, 400, 'invalid-id')
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = CreateAddonInputSchema.safeParse({ ...(body as object), listId })
		if (!parsed.success) return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		const result = await createListAddonImpl({ userId, input: parsed.data })
		if (result.kind === 'error') {
			if (result.reason === 'cannot-add-to-own-list') return jsonError(c, 409, 'cannot-add-to-own-list')
			return jsonError(c, 404, result.reason)
		}
		return c.json({ addon: result.addon })
	})

	v1.patch('/addons/:addonId', async c => {
		const userId = c.get('userId')
		const addonId = Number(c.req.param('addonId'))
		if (!Number.isFinite(addonId) || addonId <= 0) return jsonError(c, 400, 'invalid-id')
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const parsed = UpdateAddonInputSchema.safeParse({ ...(body as object), addonId })
		if (!parsed.success) return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		const result = await updateListAddonImpl({ userId, input: parsed.data })
		if (result.kind === 'error') {
			const status = result.reason === 'not-found' ? 404 : 403
			return jsonError(c, status, result.reason)
		}
		return c.json({ addon: result.addon })
	})

	v1.post('/addons/:addonId/archive', async c => {
		const userId = c.get('userId')
		const addonId = Number(c.req.param('addonId'))
		if (!Number.isFinite(addonId) || addonId <= 0) return jsonError(c, 400, 'invalid-id')
		const parsed = ArchiveAddonInputSchema.safeParse({ addonId })
		if (!parsed.success) return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		const result = await archiveListAddonImpl({ userId, input: parsed.data })
		if (result.kind === 'error') {
			if (result.reason === 'already-archived') return jsonError(c, 409, 'already-archived')
			const status = result.reason === 'not-found' ? 404 : 403
			return jsonError(c, status, result.reason)
		}
		return c.json({ ok: true })
	})

	v1.delete('/addons/:addonId', async c => {
		const userId = c.get('userId')
		const addonId = Number(c.req.param('addonId'))
		if (!Number.isFinite(addonId) || addonId <= 0) return jsonError(c, 400, 'invalid-id')
		const parsed = DeleteAddonInputSchema.safeParse({ addonId })
		if (!parsed.success) return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		const result = await deleteListAddonImpl({ userId, input: parsed.data })
		if (result.kind === 'error') {
			const status = result.reason === 'not-found' ? 404 : 403
			return jsonError(c, status, result.reason)
		}
		return c.json({ ok: true })
	})
}
