// Server-fn surface for the purchase summary. The implementation lives
// in `_purchases-impl.ts` (the `_<name>-impl.ts` convention) so it takes
// an injectable `dbx` handle for integration tests. This file only
// references the impl from inside its `.handler()` callback, which
// TanStack Start strips on the client.

import { createServerFn } from '@tanstack/react-start'

import { loggingMiddleware } from '@/lib/logger'
import { authMiddleware } from '@/middleware/auth'

import { getPurchaseSummaryImpl, type PurchaseSummary } from './_purchases-impl'

export type { PurchaseSummary, SummaryItem } from './_purchases-impl'

export const getPurchaseSummary = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(({ context }): Promise<PurchaseSummary> => getPurchaseSummaryImpl(context.session.user.id))
