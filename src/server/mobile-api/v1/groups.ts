// Item groups - the "or" / "order" sub-list construct that lets a list
// owner mark items as alternatives ("any one of these") or as an
// ordered sequence ("buy them in this order"). Read-only here; MCP
// reads groups alongside a list's items.

import { eq } from 'drizzle-orm'
import type { Hono } from 'hono'

import { getGroupsForListImpl } from '@/api/_groups-impl'
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
}
