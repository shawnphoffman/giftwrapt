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

import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'

import type { SchemaDatabase } from '@/db'
import { lists, todoItems, users } from '@/db/schema'
import { priorityEnumValues } from '@/db/schema/enums'
import type { TodoItem } from '@/db/schema/todo-items'
import { canEditList, canViewListAsAnyone } from '@/lib/permissions'

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

// Todo-list read gate. Unlike gift lists, a todo list's read surface is
// effectively "anyone who can edit it OR could otherwise see it." This
// extends `canViewList` with one extra case: editors of a *private* todo
// list (`listEditors` row) can read its rows, since they're already
// authorized to mutate them via `canEditList`. `inactive`, `denied`, and
// `restricted` all still reject.
//
// Kept local to the todo subsystem so we don't widen the semantics of the
// shared `canViewList` for every gift-list surface (visibility there has
// to remain strict because of claim/addon spoiler protection).
async function canReadTodos(viewerId: string, list: ListForPermCheck, dbx: SchemaDatabase): Promise<{ ok: true } | { ok: false }> {
	const view = await canViewListAsAnyone(viewerId, list, dbx)
	if (view.ok) return { ok: true }
	// Only `private` falls through to the editor check. `inactive` and
	// `denied` are absolute rejections that must apply to todo lists too.
	if (view.reason !== 'private') return { ok: false }
	const edit = await canEditList(viewerId, list, dbx)
	return edit.ok ? { ok: true } : { ok: false }
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
	if (list.ownerId !== actor.id) {
		const perm = await canEditList(actor.id, list, dbx)
		if (!perm.ok) return { kind: 'error', reason: 'not-authorized' }
	}

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
	if (list.ownerId !== actor.id) {
		const perm = await canEditList(actor.id, list, dbx)
		if (!perm.ok) return { kind: 'error', reason: 'not-authorized' }
	}

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
	if (list.ownerId !== actor.id) {
		const perm = await canEditList(actor.id, list, dbx)
		if (!perm.ok) return { kind: 'error', reason: 'not-authorized' }
	}
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
	const perm = await canReadTodos(actor.id, list, dbx)
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

export const ListTodosInputSchema = z.object({ listId: z.number().int().positive() })

export type TodoRow = {
	id: number
	listId: number
	title: string
	notes: string | null
	priority: 'low' | 'normal' | 'high' | 'very-high'
	claimedByUserId: string | null
	claimedAt: Date | null
	claimedByName: string | null
	sortOrder: number | null
	createdAt: Date
	updatedAt: Date
}

export type ListTodosResult = { kind: 'ok'; todos: Array<TodoRow> } | { kind: 'error'; reason: 'list-not-found' | 'not-authorized' }

export async function listTodosImpl(args: {
	db: SchemaDatabase
	actor: { id: string }
	input: z.output<typeof ListTodosInputSchema>
}): Promise<ListTodosResult> {
	const { db: dbx, actor, input } = args
	const list = await loadListForPerm(dbx, input.listId)
	if (!list) return { kind: 'error', reason: 'list-not-found' }
	const perm = await canReadTodos(actor.id, list, dbx)
	if (!perm.ok) return { kind: 'error', reason: 'not-authorized' }

	const rows = await dbx
		.select({
			id: todoItems.id,
			listId: todoItems.listId,
			title: todoItems.title,
			notes: todoItems.notes,
			priority: todoItems.priority,
			claimedByUserId: todoItems.claimedByUserId,
			claimedAt: todoItems.claimedAt,
			sortOrder: todoItems.sortOrder,
			createdAt: todoItems.createdAt,
			updatedAt: todoItems.updatedAt,
			claimedByName: users.name,
			claimedByEmail: users.email,
		})
		.from(todoItems)
		.leftJoin(users, eq(users.id, todoItems.claimedByUserId))
		.where(eq(todoItems.listId, input.listId))
		.orderBy(asc(todoItems.sortOrder), asc(todoItems.createdAt))

	return {
		kind: 'ok',
		todos: rows.map(r => ({
			id: r.id,
			listId: r.listId,
			title: r.title,
			notes: r.notes,
			priority: r.priority,
			claimedByUserId: r.claimedByUserId,
			claimedAt: r.claimedAt,
			claimedByName: r.claimedByName ?? r.claimedByEmail ?? null,
			sortOrder: r.sortOrder,
			createdAt: r.createdAt,
			updatedAt: r.updatedAt,
		})),
	}
}
