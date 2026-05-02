// Server-only comment implementations. Lives in a separate file from
// `comments.ts` for the same reason `_items-impl.ts` does: the impls
// transitively pull in `@/lib/resend` (top-level env access) and
// `@/lib/settings-loader` -> `@/lib/crypto/app-secret` ->
// `node:crypto`. comments.ts only references these from inside server-fn
// handler bodies, which TanStack Start strips on the client. After the
// strip the import of `_comments-impl.ts` becomes unused and Rollup
// tree-shakes the whole file out of the client bundle.

import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { itemComments, items, lists, users } from '@/db/schema'
import { createLogger } from '@/lib/logger'
import { canViewListAsAnyone } from '@/lib/permissions'
import { sendNewCommentEmail } from '@/lib/resend'
import { getAppSettings } from '@/lib/settings-loader'

const commentsLog = createLogger('api:comments')

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

export async function getCommentsForItemImpl(args: { userId: string; itemId: number }): Promise<Array<CommentWithUser>> {
	const { userId, itemId } = args

	const item = await db.query.items.findFirst({
		where: eq(items.id, itemId),
		columns: { id: true, listId: true },
	})
	if (!item) return []

	const list = await db.query.lists.findFirst({
		where: eq(lists.id, item.listId),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
	})
	if (!list) return []

	const view = await canViewListAsAnyone(userId, list)
	if (!view.ok) return []

	const rows = await db.query.itemComments.findMany({
		where: eq(itemComments.itemId, itemId),
		orderBy: [asc(itemComments.createdAt)],
		with: {
			user: { columns: { id: true, name: true, email: true, image: true } },
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
}

export const CreateCommentInputSchema = z.object({
	itemId: z.number().int().positive(),
	comment: z.string().min(1).max(5000),
})

export type CreateCommentResult =
	| { kind: 'ok'; comment: CommentWithUser }
	| { kind: 'error'; reason: 'item-not-found' | 'not-visible' | 'comments-disabled' }

export async function createItemCommentImpl(args: {
	userId: string
	input: z.infer<typeof CreateCommentInputSchema>
}): Promise<CreateCommentResult> {
	const { userId, input: data } = args

	const settings = await getAppSettings(db)
	if (!settings.enableComments) return { kind: 'error', reason: 'comments-disabled' }

	const item = await db.query.items.findFirst({
		where: eq(items.id, data.itemId),
		columns: { id: true, listId: true, title: true },
	})
	if (!item) return { kind: 'error', reason: 'item-not-found' }

	const list = await db.query.lists.findFirst({
		where: eq(lists.id, item.listId),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
	})
	if (!list) return { kind: 'error', reason: 'item-not-found' }

	const view = await canViewListAsAnyone(userId, list)
	if (!view.ok) return { kind: 'error', reason: 'not-visible' }

	const [inserted] = await db
		.insert(itemComments)
		.values({
			itemId: data.itemId,
			userId,
			comment: data.comment,
		})
		.returning()

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
			commentsLog.error({ err, listId: list.id, itemId: item.id }, 'failed to send comment notification email')
		}
	}

	return { kind: 'ok', comment: result }
}

export const UpdateCommentInputSchema = z.object({
	commentId: z.number().int().positive(),
	comment: z.string().min(1).max(5000),
})

export type UpdateCommentResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-yours' }

export async function updateItemCommentImpl(args: {
	userId: string
	input: z.infer<typeof UpdateCommentInputSchema>
}): Promise<UpdateCommentResult> {
	const { userId, input: data } = args

	const existing = await db.query.itemComments.findFirst({
		where: eq(itemComments.id, data.commentId),
		columns: { id: true, userId: true },
	})
	if (!existing) return { kind: 'error', reason: 'not-found' }
	if (existing.userId !== userId) return { kind: 'error', reason: 'not-yours' }

	await db.update(itemComments).set({ comment: data.comment }).where(eq(itemComments.id, data.commentId))
	return { kind: 'ok' }
}

export const DeleteCommentInputSchema = z.object({
	commentId: z.number().int().positive(),
})

export type DeleteCommentResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export async function deleteItemCommentImpl(args: {
	userId: string
	input: z.infer<typeof DeleteCommentInputSchema>
}): Promise<DeleteCommentResult> {
	const { userId, input: data } = args

	const existing = await db.query.itemComments.findFirst({
		where: eq(itemComments.id, data.commentId),
		columns: { id: true, userId: true, itemId: true },
	})
	if (!existing) return { kind: 'error', reason: 'not-found' }

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
}
