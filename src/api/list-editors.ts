import { createServerFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { listEditors, lists, users } from '@/db/schema'
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
	email: z.string().email('Must be a valid email'),
})

export type AddEditorResult =
	| { kind: 'ok'; editor: EditorOnList }
	| { kind: 'error'; reason: 'list-not-found' | 'not-owner' | 'user-not-found' | 'already-editor' | 'cannot-add-self' }

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

		// Look up the target user by email.
		const targetUser = await db.query.users.findFirst({
			where: eq(users.email, data.email.toLowerCase().trim()),
			columns: { id: true, name: true, email: true, image: true },
		})
		if (!targetUser) return { kind: 'error', reason: 'user-not-found' }
		if (targetUser.id === ownerId) return { kind: 'error', reason: 'cannot-add-self' }

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
				user: targetUser,
			},
		}
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
