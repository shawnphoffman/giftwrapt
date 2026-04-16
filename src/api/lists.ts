import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq, sql } from 'drizzle-orm'

import { db } from '@/db'
import { items, listAddons, lists } from '@/db/schema'
import type { ListType } from '@/db/schema/enums'
import type { GiftedItem } from '@/db/schema/gifts'
import type { Item } from '@/db/schema/items'
import type { ListAddon } from '@/db/schema/lists'
import { canViewList } from '@/lib/permissions'
import { authMiddleware } from '@/middleware/auth'

export type GiftOnItem = Pick<GiftedItem, 'id' | 'itemId' | 'gifterId' | 'quantity' | 'notes' | 'totalCost' | 'createdAt'> & {
	gifter: {
		id: string
		name: string | null
		email: string
		image: string | null
	}
}

export type ItemWithGifts = Item & {
	gifts: Array<GiftOnItem>
}

export type AddonOnList = Pick<ListAddon, 'id' | 'listId' | 'userId' | 'description' | 'totalCost' | 'notes' | 'isArchived' | 'createdAt'> & {
	user: {
		id: string
		name: string | null
		email: string
		image: string | null
	}
}

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
	items: Array<ItemWithGifts>
	addons: Array<AddonOnList>
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

		if (!list?.owner) return null

		const currentUserId = context.session.user.id
		if (list.ownerId === currentUserId) {
			return { kind: 'redirect', listId: String(list.id) }
		}

		// Owner-agnostic visibility: inactive / private / explicitly-denied all
		// collapse to null so nothing leaks about list existence.
		const view = await canViewList(currentUserId, list)
		if (!view.ok) return null

		// Determine sort order based on sort parameter. inputValidator defaults
		// data.sort to 'priority-desc' already, so no fallback needed here.
		const [sortBy, sortOrder] = data.sort.split('-') as [string, 'asc' | 'desc']

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

		// Fetch items + their gifts in one round-trip. Visibility is already
		// established above, so every claim on these items is OK to show to
		// this viewer. Gifts have no archive concept (claims are hard-deleted
		// on retraction), so no filter is needed on the gifts side.
		const listItems = await db.query.items.findMany({
			where: and(eq(items.listId, list.id), eq(items.isArchived, false)),
			orderBy,
			with: {
				gifts: {
					columns: {
						id: true,
						itemId: true,
						gifterId: true,
						quantity: true,
						notes: true,
						totalCost: true,
						createdAt: true,
					},
					with: {
						gifter: {
							columns: { id: true, name: true, email: true, image: true },
						},
					},
				},
			},
		})

		// Fetch addons (off-list gifts) for this list. Non-archived addons are
		// active; archived ones mean "gift was given" and surface on the
		// recipient's received-gifts page. We fetch both here so the UI can
		// differentiate, but the list-detail section only shows non-archived.
		const addons = await db.query.listAddons.findMany({
			where: eq(listAddons.listId, list.id),
			columns: {
				id: true,
				listId: true,
				userId: true,
				description: true,
				totalCost: true,
				notes: true,
				isArchived: true,
				createdAt: true,
			},
			with: {
				user: {
					columns: { id: true, name: true, email: true, image: true },
				},
			},
			orderBy: [desc(listAddons.createdAt)],
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
				addons,
			},
		}
	})
