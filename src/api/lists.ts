import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq, sql } from 'drizzle-orm'

import { db } from '@/db'
import { items, lists } from '@/db/schema'
import type { Item } from '@/db/schema/items'
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
	items: Item[]
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

export type SortOption = 'priority-asc' | 'priority-desc' | 'date-asc' | 'date-desc'

export const getListForViewing = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.inputValidator((data: { listId: string; sort?: SortOption }) => ({
		listId: data.listId,
		sort: data.sort || ('priority-desc' as SortOption),
	}))
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

		// Determine sort order based on sort parameter
		const sort = data.sort || 'priority-desc'
		const [sortBy, sortOrder] = sort.split('-') as [string, 'asc' | 'desc']

		let orderBy
		if (sortBy === 'priority') {
			// Priority sorting: very-high: 4, high: 3, normal: 2, low: 1
			const priorityOrder = sql<number>`
				CASE ${items.priority}
					WHEN 'very-high' THEN 4
					WHEN 'high' THEN 3
					WHEN 'normal' THEN 2
					WHEN 'low' THEN 1
					ELSE 0
				END
			`
			orderBy = sortOrder === 'asc' ? [asc(priorityOrder)] : [desc(priorityOrder)]
		} else {
			// Date sorting
			orderBy = sortOrder === 'asc' ? [asc(items.createdAt)] : [desc(items.createdAt)]
		}

		// Fetch items for the list
		const listItems = await db.query.items.findMany({
			where: and(eq(items.listId, list.id), eq(items.isArchived, false)),
			orderBy,
		})

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
				items: listItems,
			},
		}
	})
