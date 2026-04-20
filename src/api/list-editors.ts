import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, ne, notInArray } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { listEditors, lists, users } from '@/db/schema'
import type { Role } from '@/db/schema/enums'
import { authMiddleware } from '@/middleware/auth'

// ===============================
// READ — editors for a list
// ===============================
// Returns every user who has list-level editor access. Only the list
// owner should see this; the loader in $listId.edit.tsx gates access.

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

export const getListEditors = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.inputValidator((data: { listId: number }) => ({ listId: data.listId }))
	.handler(async ({ context, data }): Promise<Array<EditorOnList>> => {
		const userId = context.session.user.id

		// Only the list owner can see the editor list.
		const list = await db.query.lists.findFirst({
			where: eq(lists.id, data.listId),
			columns: { id: true, ownerId: true },
		})
		if (!list || list.ownerId !== userId) return []

		const rows = await db.query.listEditors.findMany({
			where: eq(listEditors.listId, data.listId),
			columns: { id: true, userId: true },
			with: {
				user: {
					columns: { id: true, name: true, email: true, image: true },
				},
			},
		})

		return rows
	})

// ===============================
// WRITE — grant editor access
// ===============================
// Only the list owner can grant. The target user must exist.

const AddEditorInputSchema = z.object({
	listId: z.number().int().positive(),
	userId: z.string().min(1),
})

export type AddEditorResult =
	| { kind: 'ok'; editor: EditorOnList }
	| {
			kind: 'error'
			reason: 'list-not-found' | 'not-owner' | 'user-not-found' | 'already-editor' | 'cannot-add-self' | 'user-is-child'
	  }

export const addListEditor = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.input<typeof AddEditorInputSchema>) => AddEditorInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<AddEditorResult> => {
		const ownerId = context.session.user.id

		const list = await db.query.lists.findFirst({
			where: eq(lists.id, data.listId),
			columns: { id: true, ownerId: true },
		})
		if (!list) return { kind: 'error', reason: 'list-not-found' }
		if (list.ownerId !== ownerId) return { kind: 'error', reason: 'not-owner' }

		if (data.userId === ownerId) return { kind: 'error', reason: 'cannot-add-self' }

		// Look up the target user.
		const targetUser = await db.query.users.findFirst({
			where: eq(users.id, data.userId),
			columns: { id: true, name: true, email: true, image: true, role: true },
		})
		if (!targetUser) return { kind: 'error', reason: 'user-not-found' }
		if (targetUser.role === 'child') return { kind: 'error', reason: 'user-is-child' }

		// Check for existing grant.
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
	})

// ===============================
// READ — users eligible to be added as editors
// ===============================
// Returns every user who is not the list owner and not already an editor.
// Includes role so the UI can disable child accounts. Only the list owner
// gets a populated list; others receive [].

export type AddableEditorUser = {
	id: string
	name: string | null
	email: string
	image: string | null
	role: Role
}

export const getAddableEditors = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.inputValidator((data: { listId: number }) => ({ listId: data.listId }))
	.handler(async ({ context, data }): Promise<Array<AddableEditorUser>> => {
		const ownerId = context.session.user.id

		const list = await db.query.lists.findFirst({
			where: eq(lists.id, data.listId),
			columns: { id: true, ownerId: true },
		})
		if (!list || list.ownerId !== ownerId) return []

		const existing = await db.query.listEditors.findMany({
			where: eq(listEditors.listId, data.listId),
			columns: { userId: true },
		})
		const takenIds = existing.map(e => e.userId)

		const rows = await db.query.users.findMany({
			where: takenIds.length > 0 ? and(ne(users.id, ownerId), notInArray(users.id, takenIds)) : ne(users.id, ownerId),
			columns: { id: true, name: true, email: true, image: true, role: true },
			orderBy: [asc(users.name), asc(users.email)],
		})

		return rows
	})

// ===============================
// WRITE — revoke editor access
// ===============================
// Only the list owner can revoke.

const RemoveEditorInputSchema = z.object({
	editorId: z.number().int().positive(),
})

export type RemoveEditorResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-owner' }

export const removeListEditor = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.input<typeof RemoveEditorInputSchema>) => RemoveEditorInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<RemoveEditorResult> => {
		const ownerId = context.session.user.id

		const existing = await db.query.listEditors.findFirst({
			where: eq(listEditors.id, data.editorId),
			columns: { id: true, ownerId: true },
		})
		if (!existing) return { kind: 'error', reason: 'not-found' }
		if (existing.ownerId !== ownerId) return { kind: 'error', reason: 'not-owner' }

		await db.delete(listEditors).where(eq(listEditors.id, data.editorId))

		return { kind: 'ok' }
	})
