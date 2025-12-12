import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { lists } from '@/db/schema'
import type { ListType } from '@/db/schema/enums'
import { authMiddleware } from '@/middleware/auth'

export type ListForViewing = {
	id: number
	name: string
	type: ListType
	owner: {
		id: string
		name: string | null
		email: string
		image: string | null
	}
}

export type GetListForViewingResult =
	| {
			kind: 'ok'
			list: ListForViewing
	  }
	| {
			kind: 'redirect'
			listId: string
	  }
	| null

export const getListForViewing = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.inputValidator((data: { listId: string }) => data)
	.handler(async ({ context, data }): Promise<GetListForViewingResult> => {
		const listId = Number(data.listId)
		if (!Number.isFinite(listId)) return null

		const list = await db.query.lists.findFirst({
			where: eq(lists.id, listId),
			columns: {
				id: true,
				name: true,
				type: true,
				isActive: true,
				isPrivate: true,
				ownerId: true,
			},
			with: {
				owner: {
					columns: {
						id: true,
						name: true,
						email: true,
						image: true,
					},
				},
			},
		})

		if (!list?.owner || !list.isActive) return null

		const currentUserId = context.session.user.id
		if (list.ownerId === currentUserId) {
			return { kind: 'redirect', listId: String(list.id) }
		}

		// Private lists are never viewable by other users (gift-giver view)
		if (list.isPrivate) return null

		// If the list owner explicitly denied the current viewer, treat as not found
		const denied = await db.query.userRelationships.findFirst({
			where: (rel, { and, eq: relEq }) =>
				and(relEq(rel.ownerUserId, list.ownerId), relEq(rel.viewerUserId, currentUserId), relEq(rel.canView, false)),
			columns: { ownerUserId: true },
		})
		if (denied) return null

		return {
			kind: 'ok',
			list: {
				id: list.id,
				name: list.name,
				type: list.type,
				owner: {
					id: list.owner.id,
					name: list.owner.name,
					email: list.owner.email,
					image: list.owner.image,
				},
			},
		}
	})
