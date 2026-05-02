// Server-fn surface for dependents (non-user gift recipients).

import { createServerFn } from '@tanstack/react-start'
import type { z } from 'zod'

import { loggingMiddleware } from '@/lib/logger'
import { authMiddleware } from '@/middleware/auth'

import {
	AddDependentGuardianInputSchema,
	addGuardianImpl,
	type AddGuardianResult,
	createDependentImpl,
	CreateDependentInputSchema,
	type CreateDependentResult,
	deleteDependentImpl,
	DeleteDependentInputSchema,
	type DeleteDependentResult,
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
	CreateDependentResult,
	DeleteDependentResult,
	DependentSummary,
	MyDependentsResult,
	RemoveGuardianResult,
	UpdateDependentResult,
} from './_dependents-impl'

export const getMyDependents = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(({ context }): Promise<MyDependentsResult> => getMyDependentsImpl({ userId: context.session.user.id }))

export const createDependent = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof CreateDependentInputSchema>) => CreateDependentInputSchema.parse(data))
	.handler(({ context, data }): Promise<CreateDependentResult> => createDependentImpl({ userId: context.session.user.id, input: data }))

export const updateDependent = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof UpdateDependentInputSchema>) => UpdateDependentInputSchema.parse(data))
	.handler(({ context, data }): Promise<UpdateDependentResult> => updateDependentImpl({ userId: context.session.user.id, input: data }))

export const deleteDependent = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof DeleteDependentInputSchema>) => DeleteDependentInputSchema.parse(data))
	.handler(({ context, data }): Promise<DeleteDependentResult> => deleteDependentImpl({ userId: context.session.user.id, id: data.id }))

export const addDependentGuardian = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof AddDependentGuardianInputSchema>) => AddDependentGuardianInputSchema.parse(data))
	.handler(({ context, data }): Promise<AddGuardianResult> => addGuardianImpl({ userId: context.session.user.id, input: data }))

export const removeDependentGuardian = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof RemoveDependentGuardianInputSchema>) => RemoveDependentGuardianInputSchema.parse(data))
	.handler(({ context, data }): Promise<RemoveGuardianResult> => removeGuardianImpl({ userId: context.session.user.id, input: data }))
