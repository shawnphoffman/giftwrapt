import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq, notInArray } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { itemComments, items, lists, userRelationships, users } from '@/db/schema'
import { createLogger, loggingMiddleware } from '@/lib/logger'
import { canViewList } from '@/lib/permissions'
import { sendNewCommentEmail } from '@/lib/resend'
import { getAppSettings } from '@/lib/settings-loader'
import { authMiddleware } from '@/middleware/auth'

const commentsLog = createLogger('api:comments')

// ===============================
// Types
// ===============================

export type CommentWithUser = {
	id: number
	itemId: number
	comment: string
	createdAt: Date
	updatedAt: Date
	user: {
		id: string
		name: string | null
		email: string
		image: string | null
	}
}

// ===============================
// READ - comments for an item
// ===============================

export const getCommentsForItem = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: { itemId: number }) => ({ itemId: data.itemId }))
	.handler(async ({ context, data }): Promise<Array<CommentWithUser>> => {
		const userId = context.session.user.id

		// Verify the viewer can see the parent list.
		const item = await db.query.items.findFirst({
			where: eq(items.id, data.itemId),
			columns: { id: true, listId: true },
		})
		if (!item) return []

		const list = await db.query.lists.findFirst({
			where: eq(lists.id, item.listId),
			columns: { id: true, ownerId: true, isPrivate: true, isActive: true },
		})
		if (!list) return []

		// Owner can see comments on their own list.
		if (list.ownerId !== userId) {
			const view = await canViewList(userId, list)
			if (!view.ok) return []
		}

		const rows = await db.query.itemComments.findMany({
			where: eq(itemComments.itemId, data.itemId),
			orderBy: [asc(itemComments.createdAt)],
			with: {
				user: {
					columns: { id: true, name: true, email: true, image: true },
				},
			},
		})

		return rows.map(r => ({
			id: r.id,
			itemId: r.itemId,
			comment: r.comment,
			createdAt: r.createdAt,
			updatedAt: r.updatedAt,
			user: r.user,
		}))
	})

// ===============================
// WRITE - create a comment
// ===============================

const CreateCommentInputSchema = z.object({
	itemId: z.number().int().positive(),
	comment: z.string().min(1).max(5000),
})

export type CreateCommentResult =
	| { kind: 'ok'; comment: CommentWithUser }
	| { kind: 'error'; reason: 'item-not-found' | 'not-visible' | 'comments-disabled' }

export const createItemComment = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof CreateCommentInputSchema>) => CreateCommentInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<CreateCommentResult> => {
		const userId = context.session.user.id

		const settings = await getAppSettings(db)
		if (!settings.enableComments) return { kind: 'error', reason: 'comments-disabled' }

		const item = await db.query.items.findFirst({
			where: eq(items.id, data.itemId),
			columns: { id: true, listId: true, title: true },
		})
		if (!item) return { kind: 'error', reason: 'item-not-found' }

		const list = await db.query.lists.findFirst({
			where: eq(lists.id, item.listId),
			columns: { id: true, ownerId: true, isPrivate: true, isActive: true },
		})
		if (!list) return { kind: 'error', reason: 'item-not-found' }

		// Anyone who can view the list can comment (including the owner).
		if (list.ownerId !== userId) {
			const view = await canViewList(userId, list)
			if (!view.ok) return { kind: 'error', reason: 'not-visible' }
		}

		const [inserted] = await db
			.insert(itemComments)
			.values({
				itemId: data.itemId,
				userId,
				comment: data.comment,
			})
			.returning()

		// Fetch the user for the response.
		const commenter = await db.query.users.findFirst({
			where: eq(users.id, userId),
			columns: { id: true, name: true, email: true, image: true },
		})

		const result: CommentWithUser = {
			id: inserted.id,
			itemId: inserted.itemId,
			comment: inserted.comment,
			createdAt: inserted.createdAt,
			updatedAt: inserted.updatedAt,
			user: commenter!,
		}

		// Send email to list owner (if commenter is not the owner).
		if (list.ownerId !== userId && settings.enableCommentEmails) {
			try {
				const owner = await db.query.users.findFirst({
					where: eq(users.id, list.ownerId),
					columns: { name: true, email: true },
				})
				if (owner) {
					await sendNewCommentEmail(
						owner.name || 'there',
						owner.email,
						commenter?.name || commenter?.email || 'Someone',
						data.comment,
						item.title,
						list.id,
						item.id
					)
				}
			} catch (err) {
				// Email failure shouldn't block the comment creation.
				commentsLog.error({ err, listId: list.id, itemId: item.id }, 'failed to send comment notification email')
			}
		}

		return { kind: 'ok', comment: result }
	})

// ===============================
// WRITE - update a comment
// ===============================

const UpdateCommentInputSchema = z.object({
	commentId: z.number().int().positive(),
	comment: z.string().min(1).max(5000),
})

export type UpdateCommentResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-yours' }

export const updateItemComment = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof UpdateCommentInputSchema>) => UpdateCommentInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<UpdateCommentResult> => {
		const userId = context.session.user.id

		const existing = await db.query.itemComments.findFirst({
			where: eq(itemComments.id, data.commentId),
			columns: { id: true, userId: true },
		})
		if (!existing) return { kind: 'error', reason: 'not-found' }
		if (existing.userId !== userId) return { kind: 'error', reason: 'not-yours' }

		await db.update(itemComments).set({ comment: data.comment }).where(eq(itemComments.id, data.commentId))

		return { kind: 'ok' }
	})

// ===============================
// WRITE - delete a comment (hard delete)
// ===============================

const DeleteCommentInputSchema = z.object({
	commentId: z.number().int().positive(),
})

export type DeleteCommentResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export const deleteItemComment = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof DeleteCommentInputSchema>) => DeleteCommentInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<DeleteCommentResult> => {
		const userId = context.session.user.id

		const existing = await db.query.itemComments.findFirst({
			where: eq(itemComments.id, data.commentId),
			columns: { id: true, userId: true, itemId: true },
		})
		if (!existing) return { kind: 'error', reason: 'not-found' }

		// Original commenter or list owner can delete.
		if (existing.userId !== userId) {
			const item = await db.query.items.findFirst({
				where: eq(items.id, existing.itemId),
				columns: { listId: true },
			})
			if (!item) return { kind: 'error', reason: 'not-found' }

			const list = await db.query.lists.findFirst({
				where: eq(lists.id, item.listId),
				columns: { ownerId: true },
			})
			if (!list || list.ownerId !== userId) {
				return { kind: 'error', reason: 'not-authorized' }
			}
		}

		await db.delete(itemComments).where(eq(itemComments.id, data.commentId))
		return { kind: 'ok' }
	})

// ===============================
// READ - recent comments (across all visible lists)
// ===============================

export type RecentCommentRow = {
	id: number
	comment: string
	createdAt: Date
	itemId: number
	itemTitle: string
	listId: number
	listName: string
	listOwnerName: string | null
	user: {
		id: string
		name: string | null
		email: string
		image: string | null
	}
}

export const getRecentComments = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(async ({ context }): Promise<Array<RecentCommentRow>> => {
		// Fetch the 50 most recent comments across all non-archived items
		// on active, non-private lists. Excludes lists owned by anyone who
		// has explicitly denied this viewer.
		const viewerId = context.session.user.id

		const deniedOwners = db
			.select({ ownerUserId: userRelationships.ownerUserId })
			.from(userRelationships)
			.where(and(eq(userRelationships.viewerUserId, viewerId), eq(userRelationships.canView, false)))

		const rows = await db
			.select({
				id: itemComments.id,
				comment: itemComments.comment,
				createdAt: itemComments.createdAt,
				itemId: items.id,
				itemTitle: items.title,
				listId: lists.id,
				listName: lists.name,
				listOwnerId: lists.ownerId,
				listOwnerName: users.name,
				userId: itemComments.userId,
			})
			.from(itemComments)
			.innerJoin(items, eq(items.id, itemComments.itemId))
			.innerJoin(lists, and(eq(lists.id, items.listId), eq(lists.isActive, true), eq(lists.isPrivate, false)))
			.innerJoin(users, eq(users.id, lists.ownerId))
			.where(and(eq(items.isArchived, false), notInArray(lists.ownerId, deniedOwners)))
			.orderBy(desc(itemComments.createdAt))
			.limit(50)

		// Fetch commenter info.
		const commenterIds = [...new Set(rows.map(r => r.userId))]
		const commenters =
			commenterIds.length > 0
				? await db.query.users.findMany({
						where: (u, { inArray }) => inArray(u.id, commenterIds),
						columns: { id: true, name: true, email: true, image: true },
					})
				: []
		const commenterMap = new Map(commenters.map(c => [c.id, c]))

		return rows.map(r => ({
			id: r.id,
			comment: r.comment,
			createdAt: r.createdAt,
			itemId: r.itemId,
			itemTitle: r.itemTitle,
			listId: r.listId,
			listName: r.listName,
			listOwnerName: r.listOwnerName,
			user: commenterMap.get(r.userId) ?? { id: r.userId, name: null, email: '', image: null },
		}))
	})
