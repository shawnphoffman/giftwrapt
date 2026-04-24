import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, gte } from 'drizzle-orm'

import { db } from '@/db'
import { items, lists, users } from '@/db/schema'
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
	priority: string
	quantity: number
	createdAt: Date
	listId: number
	listName: string
	listOwnerName: string | null
	listOwnerEmail: string
}

export const getRecentItems = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(async (): Promise<Array<RecentItemRow>> => {
		// Recent items from public, active lists in the last 30 days.
		const thirtyDaysAgo = new Date()
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

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
				listOwnerName: users.name,
				listOwnerEmail: users.email,
			})
			.from(items)
			.innerJoin(lists, and(eq(lists.id, items.listId), eq(lists.isActive, true), eq(lists.isPrivate, false)))
			.innerJoin(users, eq(users.id, lists.ownerId))
			.where(and(eq(items.isArchived, false), gte(items.createdAt, thirtyDaysAgo)))
			.orderBy(desc(items.createdAt))
			.limit(50)

		return rows
	})
