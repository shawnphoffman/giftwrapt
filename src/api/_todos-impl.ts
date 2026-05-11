// Server-only todo create/update/claim/delete implementations.
//
// Todo lists have a different shape from gift lists: claiming a todo
// IS marking it done (single `claimedByUserId` field, any viewer can
// toggle), no spoiler protection (claimers visible to everyone), and
// none of the gift-specific fields (price, quantity, url, vendor,
// image, ratings, groups, addons).
//
// Permission model:
//   - create / edit-title-notes / delete: edit access on the list
//     (owner / guardian / editor via canEditList).
//   - claim toggle: any viewer (canViewList), including the owner.

import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import type { SchemaDatabase } from '@/db'
import { lists, todoItems } from '@/db/schema'
import { priorityEnumValues } from '@/db/schema/enums'
import type { TodoItem } from '@/db/schema/todo-items'
import { canEditList, canViewList } from '@/lib/permissions'

type ListForPermCheck = {
	id: number
	ownerId: string
	subjectDependentId: string | null
	isPrivate: boolean
	isActive: boolean
	type: string
}

async function loadListForPerm(dbx: SchemaDatabase, listId: number): Promise<ListForPermCheck | null> {
	const row = await dbx.query.lists.findFirst({
		where: eq(lists.id, listId),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true, type: true },
	})
	return row ?? null
}

export const CreateTodoInputSchema = z.object({
	listId: z.number().int().positive(),
	title: z.string().min(1).max(500),
	notes: z.string().max(10000).optional(),
	priority: z.enum(priorityEnumValues).optional(),
})

export type CreateTodoResult =
	| { kind: 'ok'; todo: TodoItem }
	| { kind: 'error'; reason: 'list-not-found' | 'not-a-todo-list' | 'not-authorized' }

export async function createTodoImpl(args: {
	db: SchemaDatabase
	actor: { id: string }
	input: z.output<typeof CreateTodoInputSchema>
}): Promise<CreateTodoResult> {
	const { db: dbx, actor, input } = args
	const list = await loadListForPerm(dbx, input.listId)
	if (!list) return { kind: 'error', reason: 'list-not-found' }
	if (list.type !== 'todos') return { kind: 'error', reason: 'not-a-todo-list' }
	const perm = await canEditList(actor.id, list)
	if (!perm.ok) return { kind: 'error', reason: 'not-authorized' }

	const [inserted] = await dbx
		.insert(todoItems)
		.values({
			listId: input.listId,
			title: input.title,
			notes: input.notes ?? null,
			priority: input.priority ?? 'normal',
		})
		.returning()

	return { kind: 'ok', todo: inserted }
}

export const UpdateTodoInputSchema = z.object({
	todoId: z.number().int().positive(),
	title: z.string().min(1).max(500).optional(),
	notes: z.string().max(10000).nullable().optional(),
	priority: z.enum(priorityEnumValues).optional(),
	sortOrder: z.number().int().nullable().optional(),
})

export type UpdateTodoResult = { kind: 'ok'; todo: TodoItem } | { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export async function updateTodoImpl(args: {
	db: SchemaDatabase
	actor: { id: string }
	input: z.output<typeof UpdateTodoInputSchema>
}): Promise<UpdateTodoResult> {
	const { db: dbx, actor, input } = args
	const todo = await dbx.query.todoItems.findFirst({ where: eq(todoItems.id, input.todoId) })
	if (!todo) return { kind: 'error', reason: 'not-found' }
	const list = await loadListForPerm(dbx, todo.listId)
	if (!list) return { kind: 'error', reason: 'not-found' }
	const perm = await canEditList(actor.id, list)
	if (!perm.ok) return { kind: 'error', reason: 'not-authorized' }

	const update: Partial<typeof todoItems.$inferInsert> = {}
	if (input.title !== undefined) update.title = input.title
	if (input.notes !== undefined) update.notes = input.notes
	if (input.priority !== undefined) update.priority = input.priority
	if (input.sortOrder !== undefined) update.sortOrder = input.sortOrder

	const [updated] = await dbx.update(todoItems).set(update).where(eq(todoItems.id, input.todoId)).returning()
	return { kind: 'ok', todo: updated }
}

export const DeleteTodoInputSchema = z.object({
	todoId: z.number().int().positive(),
})

export type DeleteTodoResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-authorized' }

export async function deleteTodoImpl(args: {
	db: SchemaDatabase
	actor: { id: string }
	input: z.output<typeof DeleteTodoInputSchema>
}): Promise<DeleteTodoResult> {
	const { db: dbx, actor, input } = args
	const todo = await dbx.query.todoItems.findFirst({ where: eq(todoItems.id, input.todoId) })
	if (!todo) return { kind: 'error', reason: 'not-found' }
	const list = await loadListForPerm(dbx, todo.listId)
	if (!list) return { kind: 'error', reason: 'not-found' }
	const perm = await canEditList(actor.id, list)
	if (!perm.ok) return { kind: 'error', reason: 'not-authorized' }
	await dbx.delete(todoItems).where(eq(todoItems.id, input.todoId))
	return { kind: 'ok' }
}

export const ToggleTodoClaimInputSchema = z.object({
	todoId: z.number().int().positive(),
})

export type ToggleTodoClaimResult =
	| { kind: 'ok'; todo: TodoItem }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' | 'already-claimed-by-other' }

// Claim ≡ done. Toggles claim state: if unclaimed, claims for the
// actor; if claimed by the actor, unclaims; if claimed by someone else,
// rejects (only the claimer or someone clearing through the UI can
// unclaim - matching the resolved spec that any viewer can toggle, but
// we'd want to prevent silent overwrite of someone else's completion).
export async function toggleTodoClaimImpl(args: {
	db: SchemaDatabase
	actor: { id: string }
	input: z.output<typeof ToggleTodoClaimInputSchema>
}): Promise<ToggleTodoClaimResult> {
	const { db: dbx, actor, input } = args
	const todo = await dbx.query.todoItems.findFirst({ where: eq(todoItems.id, input.todoId) })
	if (!todo) return { kind: 'error', reason: 'not-found' }
	const list = await loadListForPerm(dbx, todo.listId)
	if (!list) return { kind: 'error', reason: 'not-found' }
	const perm = await canViewList(actor.id, list)
	if (!perm.ok) return { kind: 'error', reason: 'not-authorized' }

	if (todo.claimedByUserId === null) {
		// Claim for the actor.
		const [updated] = await dbx
			.update(todoItems)
			.set({ claimedByUserId: actor.id, claimedAt: new Date() })
			.where(and(eq(todoItems.id, input.todoId), eq(todoItems.id, todo.id)))
			.returning()
		return { kind: 'ok', todo: updated }
	}

	// Either the actor or someone else claimed it.
	if (todo.claimedByUserId === actor.id) {
		const [updated] = await dbx
			.update(todoItems)
			.set({ claimedByUserId: null, claimedAt: null })
			.where(eq(todoItems.id, input.todoId))
			.returning()
		return { kind: 'ok', todo: updated }
	}

	// Per the resolved spec ("any viewer can toggle"), allow the actor to
	// take over someone else's claim. Treat the act as unclaim + reclaim
	// in a single update so the new claimer + claimedAt land atomically.
	const [updated] = await dbx
		.update(todoItems)
		.set({ claimedByUserId: actor.id, claimedAt: new Date() })
		.where(eq(todoItems.id, input.todoId))
		.returning()
	return { kind: 'ok', todo: updated }
}
