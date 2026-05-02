// Server-fn surface for dependents (non-user gift recipients).
//
// CRUD is admin-only: only admins create / edit / delete dependents and
// add or remove guardians. Read access (`getMyDependents`) is open to
// any authenticated user so guardians can see "my dependents" in their
// /me, /received, and create-list surfaces.

import { createServerFn } from '@tanstack/react-start'
import type { z } from 'zod'

import { loggingMiddleware } from '@/lib/logger'
import { adminAuthMiddleware, authMiddleware } from '@/middleware/auth'

import {
	AddDependentGuardianInputSchema,
	addGuardianImpl,
	type AddGuardianResult,
	type AdminDependentsResult,
	createDependentImpl,
	CreateDependentInputSchema,
	type CreateDependentResult,
	deleteDependentImpl,
	DeleteDependentInputSchema,
	type DeleteDependentResult,
	getAllDependentsImpl,
	getMyDependentsImpl,
	type MyDependentsResult,
	RemoveDependentGuardianInputSchema,
	removeGuardianImpl,
	type RemoveGuardianResult,
	updateDependentImpl,
	UpdateDependentInputSchema,
	type UpdateDependentResult,
} from './_dependents-impl'

export type {
	AddGuardianResult,
	AdminDependentsResult,
	CreateDependentResult,
	DeleteDependentResult,
	DependentSummary,
	MyDependentsResult,
	RemoveGuardianResult,
	UpdateDependentResult,
} from './_dependents-impl'

// ===============================
// Reads
// ===============================

// Available to any signed-in user. Returns dependents the caller is a
// guardian of so they can be referenced in lists, /me, and /received.
export const getMyDependents = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(({ context }): Promise<MyDependentsResult> => getMyDependentsImpl({ userId: context.session.user.id }))

// Admin-only: full inventory for the management UI.
export const getAllDependents = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.handler((): Promise<AdminDependentsResult> => getAllDependentsImpl())

// ===============================
// Writes (admin-only)
// ===============================

export const createDependent = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof CreateDependentInputSchema>) => CreateDependentInputSchema.parse(data))
	.handler(({ context, data }): Promise<CreateDependentResult> => createDependentImpl({ userId: context.session.user.id, input: data }))

export const updateDependent = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof UpdateDependentInputSchema>) => UpdateDependentInputSchema.parse(data))
	.handler(({ data }): Promise<UpdateDependentResult> => updateDependentImpl({ input: data }))

export const deleteDependent = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof DeleteDependentInputSchema>) => DeleteDependentInputSchema.parse(data))
	.handler(({ data }): Promise<DeleteDependentResult> => deleteDependentImpl({ id: data.id }))

export const addDependentGuardian = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof AddDependentGuardianInputSchema>) => AddDependentGuardianInputSchema.parse(data))
	.handler(({ data }): Promise<AddGuardianResult> => addGuardianImpl({ input: data }))

export const removeDependentGuardian = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof RemoveDependentGuardianInputSchema>) => RemoveDependentGuardianInputSchema.parse(data))
	.handler(({ data }): Promise<RemoveGuardianResult> => removeGuardianImpl({ input: data }))
