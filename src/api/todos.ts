// Public server fns for the todo list row type. Mirrors the shape of
// items.ts but with a leaner surface: create, update, delete, and a
// single claim-toggle endpoint (claim ≡ done). All bodies delegate to
// `_todos-impl.ts` so the client bundle never imports server-only
// dependencies.

import { createServerFn } from '@tanstack/react-start'
import type { z } from 'zod'

import { db } from '@/db'
import { loggingMiddleware } from '@/lib/logger'
import { authMiddleware } from '@/middleware/auth'

import {
	createTodoImpl,
	CreateTodoInputSchema,
	deleteTodoImpl,
	DeleteTodoInputSchema,
	listTodosImpl,
	ListTodosInputSchema,
	toggleTodoClaimImpl,
	ToggleTodoClaimInputSchema,
	updateTodoImpl,
	UpdateTodoInputSchema,
} from './_todos-impl'

export type { CreateTodoResult, DeleteTodoResult, ListTodosResult, TodoRow, ToggleTodoClaimResult, UpdateTodoResult } from './_todos-impl'

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

export const listTodos = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ListTodosInputSchema>) => ListTodosInputSchema.parse(data))
	.handler(({ context, data }) => listTodosImpl({ db, actor: { id: context.session.user.id }, input: data }))
