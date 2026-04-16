import { createServerFn } from '@tanstack/react-start'
import { and, asc, count, desc, eq } from 'drizzle-orm'

import { db } from '@/db'
import { guardianships, items, lists, users } from '@/db/schema'
import type { ListType } from '@/db/schema/enums'
import { authMiddleware } from '@/middleware/auth'

// ===============================
// Types
// ===============================

export type ChildUser = {
	id: string
	name: string | null
	email: string
	image: string | null
}

export type ChildListRow = {
	id: number
	name: string
	type: ListType
	isActive: boolean
	isPrivate: boolean
	isPrimary: boolean
	itemCount: number
}

// ===============================
// READ — my children (guardianship)
// ===============================

export const getMyChildren = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.handler(async ({ context }): Promise<Array<ChildUser>> => {
		const userId = context.session.user.id

		const rows = await db
			.select({
				id: users.id,
				name: users.name,
				email: users.email,
				image: users.image,
			})
			.from(guardianships)
			.innerJoin(users, eq(users.id, guardianships.childUserId))
			.where(eq(guardianships.parentUserId, userId))
			.orderBy(asc(users.name))

		return rows
	})

// ===============================
// READ — lists for a child (guardian access)
// ===============================

export const getChildLists = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.inputValidator((data: { childId: string }) => ({ childId: data.childId }))
	.handler(async ({ context, data }): Promise<Array<ChildListRow> | null> => {
		const userId = context.session.user.id

		// Verify guardianship.
		const guardian = await db.query.guardianships.findFirst({
			where: and(eq(guardianships.parentUserId, userId), eq(guardianships.childUserId, data.childId)),
		})
		if (!guardian) return null

		// Fetch child's active lists with item counts.
		const rows = await db
			.select({
				id: lists.id,
				name: lists.name,
				type: lists.type,
				isActive: lists.isActive,
				isPrivate: lists.isPrivate,
				isPrimary: lists.isPrimary,
				itemCount: count(items.id),
			})
			.from(lists)
			.leftJoin(items, and(eq(items.listId, lists.id), eq(items.isArchived, false)))
			.where(and(eq(lists.ownerId, data.childId), eq(lists.isActive, true)))
			.groupBy(lists.id)
			.orderBy(desc(lists.isPrimary), asc(lists.name))

		return rows
	})
