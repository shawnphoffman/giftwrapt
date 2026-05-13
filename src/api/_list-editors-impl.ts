// Server-only list-editor implementations. Lives in a separate file
// from `list-editors.ts` for the same reason as the other `_*-impl`
// files: keeps the server-only static import chain out of the client
// bundle.

import { and, asc, eq, inArray, ne, notInArray } from 'drizzle-orm'
import { z } from 'zod'

import { db, type SchemaDatabase } from '@/db'
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
			reason:
				| 'list-not-found'
				| 'not-owner'
				| 'user-not-found'
				| 'already-editor'
				| 'cannot-add-self'
				| 'user-is-child'
				| 'user-is-restricted'
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

export async function getListEditorsImpl(args: { userId: string; listId: number; dbx?: SchemaDatabase }): Promise<Array<EditorOnList>> {
	const { userId, listId, dbx = db } = args

	const list = await dbx.query.lists.findFirst({
		where: eq(lists.id, listId),
		columns: { id: true, ownerId: true },
	})
	if (!list || list.ownerId !== userId) return []

	const rows = await dbx.query.listEditors.findMany({
		where: eq(listEditors.listId, listId),
		columns: { id: true, userId: true },
		with: { user: { columns: { id: true, name: true, email: true, image: true } } },
	})

	return rows
}

export async function addListEditorImpl(args: {
	ownerId: string
	input: z.infer<typeof AddEditorInputSchema>
	dbx?: SchemaDatabase
}): Promise<AddEditorResult> {
	const { ownerId, input: data, dbx = db } = args

	const list = await dbx.query.lists.findFirst({
		where: eq(lists.id, data.listId),
		columns: { id: true, ownerId: true },
	})
	if (!list) return { kind: 'error', reason: 'list-not-found' }
	if (list.ownerId !== ownerId) return { kind: 'error', reason: 'not-owner' }

	if (data.userId === ownerId) return { kind: 'error', reason: 'cannot-add-self' }

	const targetUser = await dbx.query.users.findFirst({
		where: eq(users.id, data.userId),
		columns: { id: true, name: true, email: true, image: true, role: true },
	})
	if (!targetUser) return { kind: 'error', reason: 'user-not-found' }
	if (targetUser.role === 'child') return { kind: 'error', reason: 'user-is-child' }

	// Restricted users can never appear in listEditors for the same owner.
	// "Restricted wins" on conflict (logic.md edit-conflict rule).
	const restrictedRel = await dbx.query.userRelationships.findFirst({
		where: and(
			eq(userRelationships.ownerUserId, ownerId),
			eq(userRelationships.viewerUserId, targetUser.id),
			eq(userRelationships.accessLevel, 'restricted')
		),
		columns: { ownerUserId: true },
	})
	if (restrictedRel) return { kind: 'error', reason: 'user-is-restricted' }

	const existing = await dbx.query.listEditors.findFirst({
		where: and(eq(listEditors.listId, data.listId), eq(listEditors.userId, targetUser.id)),
		columns: { id: true },
	})
	if (existing) return { kind: 'error', reason: 'already-editor' }

	const [inserted] = await dbx
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

export async function getAddableEditorsImpl(args: {
	ownerId: string
	listId: number
	dbx?: SchemaDatabase
}): Promise<Array<AddableEditorUser>> {
	const { ownerId, listId, dbx = db } = args

	const list = await dbx.query.lists.findFirst({
		where: eq(lists.id, listId),
		columns: { id: true, ownerId: true },
	})
	if (!list || list.ownerId !== ownerId) return []

	const existing = await dbx.query.listEditors.findMany({
		where: eq(listEditors.listId, listId),
		columns: { userId: true },
	})

	// Exclude users who can't see the owner's lists at all (none) AND users
	// the owner has marked as restricted - both should be hidden from the
	// editor picker (the restricted ones will hard-fail in addListEditorImpl
	// anyway, but better to not surface them in the UI).
	const blocked = await dbx.query.userRelationships.findMany({
		where: and(eq(userRelationships.ownerUserId, ownerId), inArray(userRelationships.accessLevel, ['none', 'restricted'])),
		columns: { viewerUserId: true },
	})

	const excludedIds = Array.from(new Set([...existing.map(e => e.userId), ...blocked.map(d => d.viewerUserId)]))

	const rows = await dbx.query.users.findMany({
		where: excludedIds.length > 0 ? and(ne(users.id, ownerId), notInArray(users.id, excludedIds)) : ne(users.id, ownerId),
		columns: { id: true, name: true, email: true, image: true, role: true },
		orderBy: [asc(users.name), asc(users.email)],
	})

	return rows
}

export async function removeListEditorImpl(args: {
	ownerId: string
	input: z.infer<typeof RemoveEditorInputSchema>
	dbx?: SchemaDatabase
}): Promise<RemoveEditorResult> {
	const { ownerId, input: data, dbx = db } = args

	const existing = await dbx.query.listEditors.findFirst({
		where: eq(listEditors.id, data.editorId),
		columns: { id: true, ownerId: true },
	})
	if (!existing) return { kind: 'error', reason: 'not-found' }
	if (existing.ownerId !== ownerId) return { kind: 'error', reason: 'not-owner' }

	await dbx.delete(listEditors).where(eq(listEditors.id, data.editorId))
	return { kind: 'ok' }
}
