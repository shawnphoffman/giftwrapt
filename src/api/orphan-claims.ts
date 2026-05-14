// Server-fn surface for the orphan-claim alert. Implementations live in
// `_orphan-claims-impl.ts` so the static import chain (db, drizzle ops,
// storage cleanup, etc.) stays out of the client bundle.

import { createServerFn } from '@tanstack/react-start'
import type { z } from 'zod'

import { loggingMiddleware } from '@/lib/logger'
import { authMiddleware } from '@/middleware/auth'

import {
	acknowledgeOrphanedClaimImpl,
	AcknowledgeOrphanedClaimInputSchema,
	type AcknowledgeOrphanedClaimResult,
	getOrphanedClaimsForListImpl,
	GetOrphanedClaimsForListInputSchema,
	getOrphanedClaimsSummaryImpl,
	type OrphanedClaimRow,
	type OrphanedClaimSummaryRow,
} from './_orphan-claims-impl'

export type { AcknowledgeOrphanedClaimResult, OrphanedClaimRow, OrphanedClaimSummaryRow } from './_orphan-claims-impl'

export const getOrphanedClaimsForList = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof GetOrphanedClaimsForListInputSchema>) => GetOrphanedClaimsForListInputSchema.parse(data))
	.handler(
		({ context, data }): Promise<Array<OrphanedClaimRow>> =>
			getOrphanedClaimsForListImpl({ userId: context.session.user.id, listId: data.listId })
	)

export const getOrphanedClaimsSummary = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(({ context }): Promise<Array<OrphanedClaimSummaryRow>> => getOrphanedClaimsSummaryImpl({ userId: context.session.user.id }))

export const acknowledgeOrphanedClaim = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof AcknowledgeOrphanedClaimInputSchema>) => AcknowledgeOrphanedClaimInputSchema.parse(data))
	.handler(
		({ context, data }): Promise<AcknowledgeOrphanedClaimResult> =>
			acknowledgeOrphanedClaimImpl({ userId: context.session.user.id, input: data })
	)
