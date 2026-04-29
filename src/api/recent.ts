import { createServerFn } from '@tanstack/react-start'
import { and, count, desc, eq, gte, inArray, max, notInArray, sql } from 'drizzle-orm'

import { db } from '@/db'
import { itemComments, items, lists, userRelationships, users } from '@/db/schema'
import type { ListType, Priority } from '@/db/schema/enums'
import { loggingMiddleware } from '@/lib/logger'
import { authMiddleware } from '@/middleware/auth'

// ===============================
// READ - recent items (across visible lists)
// ===============================

export type RecentItemRow = {
	id: number
	title: string
	url: string | null
	price: string | null
	imageUrl: string | null
	priority: Priority
	quantity: number
	createdAt: Date
	listId: number
	listName: string
	listType: ListType
	listOwnerName: string | null
	listOwnerEmail: string
	listOwnerImage: string | null
	commentCount: number
}

export const getRecentItems = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(async ({ context }): Promise<Array<RecentItemRow>> => {
		const viewerId = context.session.user.id
		const sixtyDaysAgo = new Date()
		sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

		const deniedOwners = db
			.select({ ownerUserId: userRelationships.ownerUserId })
			.from(userRelationships)
			.where(and(eq(userRelationships.viewerUserId, viewerId), eq(userRelationships.canView, false)))

		const rows = await db
			.select({
				id: items.id,
				title: items.title,
				url: items.url,
				price: items.price,
				imageUrl: items.imageUrl,
				priority: items.priority,
				quantity: items.quantity,
				createdAt: items.createdAt,
				listId: lists.id,
				listName: lists.name,
				listType: lists.type,
				listOwnerName: users.name,
				listOwnerEmail: users.email,
				listOwnerImage: users.image,
			})
			.from(items)
			.innerJoin(lists, and(eq(lists.id, items.listId), eq(lists.isActive, true), eq(lists.isPrivate, false)))
			.innerJoin(users, eq(users.id, lists.ownerId))
			.where(and(eq(items.isArchived, false), gte(items.createdAt, sixtyDaysAgo), notInArray(lists.ownerId, deniedOwners)))
			.orderBy(desc(items.createdAt))
			.limit(50)

		const itemIds = rows.map(r => r.id)
		const counts =
			itemIds.length > 0
				? await db
						.select({ itemId: itemComments.itemId, total: count() })
						.from(itemComments)
						.where(inArray(itemComments.itemId, itemIds))
						.groupBy(itemComments.itemId)
				: []
		const countMap = new Map(counts.map(c => [c.itemId, Number(c.total)]))

		return rows.map(r => ({
			...r,
			priority: r.priority,
			listType: r.listType,
			commentCount: countMap.get(r.id) ?? 0,
		}))
	})

// ===============================
// READ - recent conversations (items with recent comment activity)
// ===============================

const COMMENTS_PER_ITEM = 3
const ITEM_LIMIT = 25

export type RecentConversationComment = {
	id: number
	comment: string
	createdAt: Date
	user: {
		id: string
		name: string | null
		email: string
		image: string | null
	}
}

export type RecentConversationRow = {
	id: number
	title: string
	url: string | null
	priority: Priority
	imageUrl: string | null
	createdAt: Date
	listId: number
	listName: string
	listType: ListType
	listOwnerName: string | null
	listOwnerEmail: string
	listOwnerImage: string | null
	comments: Array<RecentConversationComment>
	commentCount: number
}

export const getRecentConversations = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(async ({ context }): Promise<Array<RecentConversationRow>> => {
		const viewerId = context.session.user.id
		const sixtyDaysAgo = new Date()
		sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

		const deniedOwners = db
			.select({ ownerUserId: userRelationships.ownerUserId })
			.from(userRelationships)
			.where(and(eq(userRelationships.viewerUserId, viewerId), eq(userRelationships.canView, false)))

		const activeItems = await db
			.select({
				itemId: itemComments.itemId,
				latestAt: max(itemComments.createdAt),
				total: count(),
			})
			.from(itemComments)
			.innerJoin(items, eq(items.id, itemComments.itemId))
			.innerJoin(lists, and(eq(lists.id, items.listId), eq(lists.isActive, true), eq(lists.isPrivate, false)))
			.where(and(eq(items.isArchived, false), gte(itemComments.createdAt, sixtyDaysAgo), notInArray(lists.ownerId, deniedOwners)))
			.groupBy(itemComments.itemId)
			.orderBy(desc(max(itemComments.createdAt)))
			.limit(ITEM_LIMIT)

		if (activeItems.length === 0) return []

		const itemIds = activeItems.map(r => r.itemId)

		const itemRows = await db
			.select({
				id: items.id,
				title: items.title,
				url: items.url,
				priority: items.priority,
				imageUrl: items.imageUrl,
				createdAt: items.createdAt,
				listId: lists.id,
				listName: lists.name,
				listType: lists.type,
				listOwnerName: users.name,
				listOwnerEmail: users.email,
				listOwnerImage: users.image,
			})
			.from(items)
			.innerJoin(lists, eq(lists.id, items.listId))
			.innerJoin(users, eq(users.id, lists.ownerId))
			.where(inArray(items.id, itemIds))

		const itemMap = new Map(itemRows.map(r => [r.id, r]))

		// Top N comments per item using a window function. Drizzle's typed
		// builder doesn't have a clean shorthand for this so we drop into
		// raw SQL via a CTE and ROW_NUMBER().
		const commentRows = await db.execute<{
			id: number
			item_id: number
			user_id: string
			comment: string
			created_at: Date
		}>(sql`
			SELECT id, item_id, user_id, comment, created_at FROM (
				SELECT
					${itemComments.id} AS id,
					${itemComments.itemId} AS item_id,
					${itemComments.userId} AS user_id,
					${itemComments.comment} AS comment,
					${itemComments.createdAt} AS created_at,
					ROW_NUMBER() OVER (PARTITION BY ${itemComments.itemId} ORDER BY ${itemComments.createdAt} DESC) AS rn
				FROM ${itemComments}
				WHERE ${itemComments.itemId} IN (${sql.join(
					itemIds.map(id => sql`${id}`),
					sql`, `
				)})
			) ranked
			WHERE rn <= ${COMMENTS_PER_ITEM}
			ORDER BY item_id, created_at DESC
		`)

		const commenterIds = [...new Set(commentRows.rows.map(r => r.user_id))]
		const commenters =
			commenterIds.length > 0
				? await db.query.users.findMany({
						where: (u, { inArray: ia }) => ia(u.id, commenterIds),
						columns: { id: true, name: true, email: true, image: true },
					})
				: []
		const commenterMap = new Map(commenters.map(c => [c.id, c]))

		const commentsByItem = new Map<number, Array<RecentConversationComment>>()
		for (const row of commentRows.rows) {
			const list = commentsByItem.get(row.item_id) ?? []
			list.push({
				id: row.id,
				comment: row.comment,
				createdAt: new Date(row.created_at),
				user: commenterMap.get(row.user_id) ?? { id: row.user_id, name: null, email: '', image: null },
			})
			commentsByItem.set(row.item_id, list)
		}

		return activeItems
			.map(active => {
				const item = itemMap.get(active.itemId)
				if (!item) return null
				return {
					id: item.id,
					title: item.title,
					url: item.url,
					priority: item.priority,
					imageUrl: item.imageUrl,
					createdAt: item.createdAt,
					listId: item.listId,
					listName: item.listName,
					listType: item.listType,
					listOwnerName: item.listOwnerName,
					listOwnerEmail: item.listOwnerEmail,
					listOwnerImage: item.listOwnerImage,
					comments: commentsByItem.get(item.id) ?? [],
					commentCount: Number(active.total),
				}
			})
			.filter((r): r is RecentConversationRow => r !== null)
	})
