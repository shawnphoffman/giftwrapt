// User relationships - the privacy controls behind axes 1 and 2 from
// `.notes/logic.md`. "Viewers" lists are people who can see MY lists;
// "owners" lists are people whose lists I can see. Both directions
// support an explicit deny ("hide my lists from this user" / "hide
// their lists from me").

import type { Hono } from 'hono'
import { z } from 'zod'

import {
	getMyPeopleImpl,
	getOwnersWithRelationshipsForMeImpl,
	getUsersWithRelationshipsImpl,
	upsertUserRelationshipsImpl,
	upsertViewerRelationshipsImpl,
} from '@/api/_permissions-impl'
import { db } from '@/db'

import type { MobileAuthContext } from '../auth'
import { jsonError } from '../envelope'

type App = Hono<MobileAuthContext>

export function registerRelationshipRoutes(v1: App): void {
	// GET /v1/me/people - consolidated person directory used by the
	// mobile/MCP clients to populate person pickers and resolve names
	// without three round-trips. Returns every other user with computed
	// flags for the four pairwise visibility/edit dimensions plus
	// partner status. See `getMyPeopleImpl` in
	// `src/api/_permissions-impl.ts` for the field semantics.
	v1.get('/me/people', async c => {
		const currentUserId = c.get('userId')
		const people = await getMyPeopleImpl(db, currentUserId)
		return c.json({ people })
	})

	v1.get('/me/relationships/viewers', async c => {
		const currentUserId = c.get('userId')
		const relationships = await getUsersWithRelationshipsImpl(currentUserId)
		return c.json({ relationships })
	})

	v1.get('/me/relationships/owners', async c => {
		const currentUserId = c.get('userId')
		const relationships = await getOwnersWithRelationshipsForMeImpl(currentUserId)
		return c.json({ relationships })
	})

	v1.post('/me/relationships/viewers', async c => {
		const ownerUserId = c.get('userId')
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const schema = z.object({
			relationships: z
				.array(
					z.object({
						viewerUserId: z.string().min(1),
						canView: z.boolean(),
						canEdit: z.boolean(),
					})
				)
				.max(500),
		})
		const parsed = schema.safeParse(body)
		if (!parsed.success) return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		await upsertUserRelationshipsImpl({ ownerUserId, input: parsed.data })
		return c.json({ ok: true, count: parsed.data.relationships.length })
	})

	v1.post('/me/relationships/owners', async c => {
		const viewerUserId = c.get('userId')
		let body: unknown
		try {
			body = await c.req.json()
		} catch {
			return jsonError(c, 400, 'invalid-json')
		}
		const schema = z.object({
			relationships: z
				.array(
					z.object({
						ownerUserId: z.string().min(1),
						canView: z.boolean(),
					})
				)
				.max(500),
		})
		const parsed = schema.safeParse(body)
		if (!parsed.success) return jsonError(c, 400, 'invalid-input', { data: { issues: parsed.error.issues } })
		await upsertViewerRelationshipsImpl({ viewerUserId, input: parsed.data })
		return c.json({ ok: true, count: parsed.data.relationships.length })
	})
}
