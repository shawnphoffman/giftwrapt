// Server-fn surface for user-relation labels (the "people I shop for"
// declarations that drive Mother's Day / Father's Day flows).
// Implementations live in `_relation-labels-impl.ts`.

import { createServerFn } from '@tanstack/react-start'
import type { z } from 'zod'

import { loggingMiddleware } from '@/lib/logger'
import { authMiddleware } from '@/middleware/auth'

import {
	addRelationLabelImpl,
	AddRelationLabelInputSchema,
	type AddRelationLabelResult,
	getMyRelationLabelsImpl,
	type RelationLabelRow,
	removeRelationLabelImpl,
	RemoveRelationLabelInputSchema,
	type RemoveRelationLabelResult,
} from './_relation-labels-impl'

export type { AddRelationLabelResult, RelationLabelRow, RelationLabelTarget, RemoveRelationLabelResult } from './_relation-labels-impl'

export const getMyRelationLabels = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(({ context }): Promise<Array<RelationLabelRow>> => getMyRelationLabelsImpl({ userId: context.session.user.id }))

export const addRelationLabel = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof AddRelationLabelInputSchema>) => AddRelationLabelInputSchema.parse(data))
	.handler(({ context, data }): Promise<AddRelationLabelResult> => addRelationLabelImpl({ userId: context.session.user.id, input: data }))

export const removeRelationLabel = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof RemoveRelationLabelInputSchema>) => RemoveRelationLabelInputSchema.parse(data))
	.handler(
		({ context, data }): Promise<RemoveRelationLabelResult> => removeRelationLabelImpl({ userId: context.session.user.id, input: data })
	)
