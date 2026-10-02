// Server-only comment implementations. Lives in a separate file from
// `comments.ts` for the same reason `_items-impl.ts` does: the impls
// transitively pull in `@/lib/resend` (top-level env access) and
// `@/lib/settings-loader` -> `@/lib/crypto/app-secret` ->
// `node:crypto`. comments.ts only references these from inside server-fn
// handler bodies, which TanStack Start strips on the client. After the
// strip the import of `_comments-impl.ts` becomes unused and Rollup
// tree-shakes the whole file out of the client bundle.

import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db, type SchemaDatabase } from '@/db'
import { itemComments, items, lists, users } from '@/db/schema'
import { extractMentionUserIds, mentionsToPlainText, rewriteMentions } from '@/lib/comment-mentions'
import {
	listMentionableUsers,
	type MentionableUser,
	mentionDisplayName,
	refreshMentionNames,
	resolveMentionableUsers,
} from '@/lib/comment-mentions-server'
import { getGuardianRecipients } from '@/lib/guardian-emails'
import { visibleItemsWhere } from '@/lib/item-visibility'
import { notifyListEvent } from '@/lib/list-event-bus'
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

export async function getCommentsForItemImpl(args: {
	userId: string
	itemId: number
	dbx?: SchemaDatabase
}): Promise<Array<CommentWithUser>> {
	const { userId, itemId, dbx = db } = args

	// Pending-deletion items have no readable comments anywhere - the
	// orphan-alert UI is intentionally a comment-free surface, and the
	// recipient can't see the item at all.
	const item = await dbx.query.items.findFirst({
		where: and(eq(items.id, itemId), visibleItemsWhere('editable')),
		columns: { id: true, listId: true },
	})
	if (!item) return []

	const list = await dbx.query.lists.findFirst({
		where: eq(lists.id, item.listId),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
	})
	if (!list) return []

	const view = await canViewListAsAnyone(userId, list, dbx)
	if (!view.ok) return []

	const rows = await dbx.query.itemComments.findMany({
		where: eq(itemComments.itemId, itemId),
		orderBy: [asc(itemComments.createdAt)],
		with: {
			user: { columns: { id: true, name: true, email: true, image: true } },
		},
	})

	return refreshMentionNames(
		dbx,
		rows.map(r => ({
			id: r.id,
			itemId: r.itemId,
			comment: r.comment,
			createdAt: r.createdAt,
			updatedAt: r.updatedAt,
			user: r.user,
		}))
	)
}

type ListForComments = { id: number; ownerId: string; subjectDependentId: string | null; isPrivate: boolean; isActive: boolean }

// Resolves the item + list behind a comment write and gates on
// visibility. Pending-deletion items are excluded (see the comment in
// createItemCommentImpl).
async function loadCommentTarget(
	dbx: SchemaDatabase,
	userId: string,
	itemId: number
): Promise<
	| { kind: 'ok'; item: { id: number; listId: number; title: string }; list: ListForComments }
	| { kind: 'error'; reason: 'item-not-found' | 'not-visible' }
> {
	const item = await dbx.query.items.findFirst({
		where: and(eq(items.id, itemId), visibleItemsWhere('editable')),
		columns: { id: true, listId: true, title: true },
	})
	if (!item) return { kind: 'error', reason: 'item-not-found' }

	const list = await dbx.query.lists.findFirst({
		where: eq(lists.id, item.listId),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
	})
	if (!list) return { kind: 'error', reason: 'item-not-found' }

	const view = await canViewListAsAnyone(userId, list, dbx)
	if (!view.ok) return { kind: 'error', reason: 'not-visible' }
	return { kind: 'ok', item, list }
}

// Validates the @mention tokens in `text` against who can see the list.
// Valid mentions get the user's current name; anything else (unknown id,
// banned, can't see the list) is demoted to plain `@Name` text so the
// stored comment never claims a mention that won't notify anyone.
async function sanitizeCommentMentions(
	dbx: SchemaDatabase,
	list: ListForComments,
	text: string
): Promise<{ text: string; mentioned: Map<string, MentionableUser> }> {
	const mentioned = await resolveMentionableUsers(dbx, list, extractMentionUserIds(text))
	const clean = rewriteMentions(text, id => {
		const u = mentioned.get(id)
		return u ? mentionDisplayName(u) : null
	})
	return { text: clean, mentioned }
}

// People who can be @mentioned on an item: everyone who can read its
// comments, minus the viewer. Conversation participants and the list
// owner sort first since they're the likeliest targets, then by name.
export async function getMentionableUsersForItemImpl(args: {
	userId: string
	itemId: number
	dbx?: SchemaDatabase
}): Promise<Array<MentionableUser>> {
	const { userId, itemId, dbx = db } = args

	const target = await loadCommentTarget(dbx, userId, itemId)
	if (target.kind === 'error') return []

	const [people, participants] = await Promise.all([
		listMentionableUsers(dbx, target.list),
		dbx.selectDistinct({ userId: itemComments.userId }).from(itemComments).where(eq(itemComments.itemId, itemId)),
	])
	const priority = new Set([target.list.ownerId, ...participants.map(p => p.userId)])
	return people
		.filter(p => p.id !== userId)
		.sort((a, b) => {
			const pa = priority.has(a.id) ? 0 : 1
			const pb = priority.has(b.id) ? 0 : 1
			if (pa !== pb) return pa - pb
			return mentionDisplayName(a).localeCompare(mentionDisplayName(b))
		})
}

type CommentEmail = { userId: string; email: string; username: string; mentioned: boolean }

// Builds and sends the comment notification emails. Recipients:
//   - each newly @mentioned user, plus their guardians who can also see
//     the list (the guardian fan-out rule in `guardian-emails.ts`);
//   - when `notifyOwner`, the list owner and the owner's guardians.
// One email per person: the commenter is never emailed, and someone who
// is both mentioned and the owner gets the "mentioned you" version.
async function sendCommentEmails(args: {
	dbx: SchemaDatabase
	list: ListForComments
	item: { id: number; title: string }
	commenterId: string
	commentText: string
	mentioned: ReadonlyArray<MentionableUser>
	notifyOwner: boolean
}): Promise<void> {
	const { dbx, list, item, commenterId, commentText, mentioned, notifyOwner } = args

	const recipients = new Map<string, CommentEmail>()
	const add = (r: CommentEmail) => {
		if (r.userId === commenterId || recipients.has(r.userId)) return
		recipients.set(r.userId, r)
	}

	for (const m of mentioned) {
		const username = m.name || 'there'
		add({ userId: m.id, email: m.email, username, mentioned: true })
		const guardians = await getGuardianRecipients(dbx, m.id)
		for (const g of guardians) {
			const view = await canViewListAsAnyone(g.id, list, dbx)
			if (view.ok) add({ userId: g.id, email: g.email, username, mentioned: true })
		}
	}

	if (notifyOwner) {
		const owner = await dbx.query.users.findFirst({
			where: eq(users.id, list.ownerId),
			columns: { id: true, name: true, email: true },
		})
		if (owner) {
			const username = owner.name || 'there'
			add({ userId: owner.id, email: owner.email, username, mentioned: false })
			for (const g of await getGuardianRecipients(dbx, list.ownerId)) {
				add({ userId: g.id, email: g.email, username, mentioned: false })
			}
		}
	}

	if (recipients.size === 0) return

	const commenter = await dbx.query.users.findFirst({
		where: eq(users.id, commenterId),
		columns: { name: true, email: true },
	})
	const commenterName = commenter?.name || commenter?.email || 'Someone'
	const plain = mentionsToPlainText(commentText)

	for (const r of recipients.values()) {
		try {
			await sendNewCommentEmail(r.username, r.email, commenterName, plain, item.title, list.id, item.id, { mentioned: r.mentioned })
		} catch (err) {
			commentsLog.error({ err, listId: list.id, itemId: item.id, recipientId: r.userId }, 'failed to send comment notification email')
		}
	}
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
	dbx?: SchemaDatabase
}): Promise<CreateCommentResult> {
	const { userId, input: data, dbx = db } = args

	const settings = await getAppSettings(dbx)
	if (!settings.enableComments) return { kind: 'error', reason: 'comments-disabled' }

	// New comments are not allowed on pending-deletion items. The item is
	// invisible to its recipient and the only audience that can see it
	// (gifters with claims) interacts with it through the orphan-alert UI,
	// which is comment-free by design.
	const target = await loadCommentTarget(dbx, userId, data.itemId)
	if (target.kind === 'error') return target
	const { item, list } = target

	const { text, mentioned } = await sanitizeCommentMentions(dbx, list, data.comment)

	const [inserted] = await dbx
		.insert(itemComments)
		.values({
			itemId: data.itemId,
			userId,
			comment: text,
		})
		.returning()

	const commenter = await dbx.query.users.findFirst({
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

	if (settings.enableCommentEmails) {
		try {
			await sendCommentEmails({
				dbx,
				list,
				item,
				commenterId: userId,
				commentText: text,
				mentioned: [...mentioned.values()],
				// The owner (and their guardians) hear about other people's
				// comments, never their own.
				notifyOwner: list.ownerId !== userId,
			})
		} catch (err) {
			commentsLog.error({ err, listId: list.id, itemId: item.id }, 'failed to send comment notification email')
		}
	}

	notifyListEvent({ kind: 'comment', listId: list.id, itemId: data.itemId, shape: 'added' })
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
	dbx?: SchemaDatabase
}): Promise<UpdateCommentResult> {
	const { userId, input: data, dbx = db } = args

	const existing = await dbx.query.itemComments.findFirst({
		where: eq(itemComments.id, data.commentId),
		columns: { id: true, userId: true, itemId: true, comment: true },
	})
	if (!existing) return { kind: 'error', reason: 'not-found' }
	if (existing.userId !== userId) return { kind: 'error', reason: 'not-yours' }

	// Mentions are validated against the list the author can still see. If
	// they've lost access (or the item is pending deletion) the edit still
	// saves, but every mention is demoted to plain text and nobody is
	// emailed.
	const target = await loadCommentTarget(dbx, userId, existing.itemId)
	const { text, mentioned } =
		target.kind === 'ok'
			? await sanitizeCommentMentions(dbx, target.list, data.comment)
			: { text: mentionsToPlainText(data.comment), mentioned: new Map<string, MentionableUser>() }
	await dbx.update(itemComments).set({ comment: text }).where(eq(itemComments.id, data.commentId))

	// Edits only notify people who weren't already mentioned; the owner
	// heard about this comment when it was first posted.
	const previouslyMentioned = new Set(extractMentionUserIds(existing.comment))
	const added = [...mentioned.values()].filter(u => !previouslyMentioned.has(u.id))
	if (target.kind === 'ok' && added.length > 0) {
		const { item, list } = target
		const settings = await getAppSettings(dbx)
		if (settings.enableCommentEmails) {
			try {
				await sendCommentEmails({ dbx, list, item, commenterId: userId, commentText: text, mentioned: added, notifyOwner: false })
			} catch (err) {
				commentsLog.error({ err, listId: list.id, itemId: item.id }, 'failed to send comment notification email')
			}
		}
	}

	const item = await dbx.query.items.findFirst({
		where: eq(items.id, existing.itemId),
		columns: { listId: true },
	})
	if (item) notifyListEvent({ kind: 'comment', listId: item.listId, itemId: existing.itemId })
	return { kind: 'ok' }
}

export const DeleteCommentInputSchema = z.object({
	commentId: z.number().int().positive(),
})

export type DeleteCommentResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export async function deleteItemCommentImpl(args: {
	userId: string
	input: z.infer<typeof DeleteCommentInputSchema>
	dbx?: SchemaDatabase
}): Promise<DeleteCommentResult> {
	const { userId, input: data, dbx = db } = args

	const existing = await dbx.query.itemComments.findFirst({
		where: eq(itemComments.id, data.commentId),
		columns: { id: true, userId: true, itemId: true },
	})
	if (!existing) return { kind: 'error', reason: 'not-found' }

	const item = await dbx.query.items.findFirst({
		where: eq(items.id, existing.itemId),
		columns: { listId: true },
	})
	if (!item) return { kind: 'error', reason: 'not-found' }

	if (existing.userId !== userId) {
		const list = await dbx.query.lists.findFirst({
			where: eq(lists.id, item.listId),
			columns: { ownerId: true },
		})
		if (!list || list.ownerId !== userId) {
			return { kind: 'error', reason: 'not-authorized' }
		}
	}

	await dbx.delete(itemComments).where(eq(itemComments.id, data.commentId))
	notifyListEvent({ kind: 'comment', listId: item.listId, itemId: existing.itemId, shape: 'removed' })
	return { kind: 'ok' }
}
