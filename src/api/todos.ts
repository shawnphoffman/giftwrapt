// Public server fns for the todo list row type. Mirrors the shape of
// items.ts but with a leaner surface: create, update, delete, and a
// single claim-toggle endpoint (claim ≡ done). All bodies delegate to
// `_todos-impl.ts` so the client bundle never imports server-only
// dependencies.

import { createServerFn } from '@tanstack/react-start'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { lists, todoItems, users } from '@/db/schema'
import { loggingMiddleware } from '@/lib/logger'
import { canViewList } from '@/lib/permissions'
import { authMiddleware } from '@/middleware/auth'

import {
	createTodoImpl,
	CreateTodoInputSchema,
	deleteTodoImpl,
	DeleteTodoInputSchema,
	toggleTodoClaimImpl,
	ToggleTodoClaimInputSchema,
	updateTodoImpl,
	UpdateTodoInputSchema,
} from './_todos-impl'

export type { CreateTodoResult, DeleteTodoResult, ToggleTodoClaimResult, UpdateTodoResult } from './_todos-impl'

export const createTodo = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof CreateTodoInputSchema>) => CreateTodoInputSchema.parse(data))
	.handler(({ context, data }) => createTodoImpl({ db, actor: { id: context.session.user.id }, input: data }))

export const updateTodo = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof UpdateTodoInputSchema>) => UpdateTodoInputSchema.parse(data))
	.handler(({ context, data }) => updateTodoImpl({ db, actor: { id: context.session.user.id }, input: data }))

export const deleteTodo = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof DeleteTodoInputSchema>) => DeleteTodoInputSchema.parse(data))
	.handler(({ context, data }) => deleteTodoImpl({ db, actor: { id: context.session.user.id }, input: data }))

export const toggleTodoClaim = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ToggleTodoClaimInputSchema>) => ToggleTodoClaimInputSchema.parse(data))
	.handler(({ context, data }) => toggleTodoClaimImpl({ db, actor: { id: context.session.user.id }, input: data }))

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

// Read path for todo items. Loads the list (for permission gate),
// then todo rows joined with claimer name for display. No spoiler
// filtering - any viewer sees the claimer.
export const listTodos = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ListTodosInputSchema>) => ListTodosInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<ListTodosResult> => {
		const list = await db.query.lists.findFirst({
			where: eq(lists.id, data.listId),
			columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
		})
		if (!list) return { kind: 'error', reason: 'list-not-found' }
		const perm = await canViewList(context.session.user.id, list)
		if (!perm.ok) return { kind: 'error', reason: 'not-authorized' }

		const rows = await db
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
			.where(eq(todoItems.listId, data.listId))
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
	})
