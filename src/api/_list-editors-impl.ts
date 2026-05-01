// Server-only list-editor implementations. Lives in a separate file
// from `list-editors.ts` for the same reason as the other `_*-impl`
// files: keeps the server-only static import chain out of the client
// bundle.

import { and, asc, eq, ne, notInArray } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { listEditors, lists, userRelationships, users } from '@/db/schema'
import type { Role } from '@/db/schema/enums'

// ===============================
// Public types
// ===============================

export type EditorOnList = {
	id: number
	userId: string
	user: {
		id: string
		name: string | null
		email: string
		image: string | null
	}
}

export type AddEditorResult =
	| { kind: 'ok'; editor: EditorOnList }
	| {
			kind: 'error'
			reason: 'list-not-found' | 'not-owner' | 'user-not-found' | 'already-editor' | 'cannot-add-self' | 'user-is-child'
	  }

export type AddableEditorUser = {
	id: string
	name: string | null
	email: string
	image: string | null
	role: Role
}

export type RemoveEditorResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-owner' }

// ===============================
// Input schemas
// ===============================

export const AddEditorInputSchema = z.object({
	listId: z.number().int().positive(),
	userId: z.string().min(1),
})

export const RemoveEditorInputSchema = z.object({
	editorId: z.number().int().positive(),
})

// ===============================
// Impls
// ===============================

export async function getListEditorsImpl(args: { userId: string; listId: number }): Promise<Array<EditorOnList>> {
	const { userId, listId } = args

	const list = await db.query.lists.findFirst({
		where: eq(lists.id, listId),
		columns: { id: true, ownerId: true },
	})
	if (!list || list.ownerId !== userId) return []

	const rows = await db.query.listEditors.findMany({
		where: eq(listEditors.listId, listId),
		columns: { id: true, userId: true },
		with: { user: { columns: { id: true, name: true, email: true, image: true } } },
	})

	return rows
}

export async function addListEditorImpl(args: { ownerId: string; input: z.infer<typeof AddEditorInputSchema> }): Promise<AddEditorResult> {
	const { ownerId, input: data } = args

	const list = await db.query.lists.findFirst({
		where: eq(lists.id, data.listId),
		columns: { id: true, ownerId: true },
	})
	if (!list) return { kind: 'error', reason: 'list-not-found' }
	if (list.ownerId !== ownerId) return { kind: 'error', reason: 'not-owner' }

	if (data.userId === ownerId) return { kind: 'error', reason: 'cannot-add-self' }

	const targetUser = await db.query.users.findFirst({
		where: eq(users.id, data.userId),
		columns: { id: true, name: true, email: true, image: true, role: true },
	})
	if (!targetUser) return { kind: 'error', reason: 'user-not-found' }
	if (targetUser.role === 'child') return { kind: 'error', reason: 'user-is-child' }

	const existing = await db.query.listEditors.findFirst({
		where: and(eq(listEditors.listId, data.listId), eq(listEditors.userId, targetUser.id)),
		columns: { id: true },
	})
	if (existing) return { kind: 'error', reason: 'already-editor' }

	const [inserted] = await db
		.insert(listEditors)
		.values({
			listId: data.listId,
			userId: targetUser.id,
			ownerId,
		})
		.returning()

	return {
		kind: 'ok',
		editor: {
			id: inserted.id,
			userId: inserted.userId,
			user: {
				id: targetUser.id,
				name: targetUser.name,
				email: targetUser.email,
				image: targetUser.image,
			},
		},
	}
}

export async function getAddableEditorsImpl(args: { ownerId: string; listId: number }): Promise<Array<AddableEditorUser>> {
	const { ownerId, listId } = args

	const list = await db.query.lists.findFirst({
		where: eq(lists.id, listId),
		columns: { id: true, ownerId: true },
	})
	if (!list || list.ownerId !== ownerId) return []

	const existing = await db.query.listEditors.findMany({
		where: eq(listEditors.listId, listId),
		columns: { userId: true },
	})

	const denied = await db.query.userRelationships.findMany({
		where: and(eq(userRelationships.ownerUserId, ownerId), eq(userRelationships.canView, false)),
		columns: { viewerUserId: true },
	})

	const excludedIds = Array.from(new Set([...existing.map(e => e.userId), ...denied.map(d => d.viewerUserId)]))

	const rows = await db.query.users.findMany({
		where: excludedIds.length > 0 ? and(ne(users.id, ownerId), notInArray(users.id, excludedIds)) : ne(users.id, ownerId),
		columns: { id: true, name: true, email: true, image: true, role: true },
		orderBy: [asc(users.name), asc(users.email)],
	})

	return rows
}

export async function removeListEditorImpl(args: {
	ownerId: string
	input: z.infer<typeof RemoveEditorInputSchema>
}): Promise<RemoveEditorResult> {
	const { ownerId, input: data } = args

	const existing = await db.query.listEditors.findFirst({
		where: eq(listEditors.id, data.editorId),
		columns: { id: true, ownerId: true },
	})
	if (!existing) return { kind: 'error', reason: 'not-found' }
	if (existing.ownerId !== ownerId) return { kind: 'error', reason: 'not-owner' }

	await db.delete(listEditors).where(eq(listEditors.id, data.editorId))
	return { kind: 'ok' }
}
