// Server-fn surface for the bulk-import flow. Mirrors the items.ts
// pattern: the impl lives in `_import-impl.ts` so the static import
// chain (db, drizzle, scrape-queue runner) stays out of the client
// bundle.

import { createServerFn } from '@tanstack/react-start'
import type { z } from 'zod'

import { db } from '@/db'
import { loggingMiddleware } from '@/lib/logger'
import { authMiddleware } from '@/middleware/auth'

import { bulkCreateItemsImpl, BulkCreateItemsInputSchema, type BulkCreateItemsResult } from './_import-impl'

export type { BulkCreateItemsResult, ItemDraft } from './_import-impl'

export const bulkCreateItems = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof BulkCreateItemsInputSchema>) => BulkCreateItemsInputSchema.parse(data))
	.handler(
		({ context, data }): Promise<BulkCreateItemsResult> => bulkCreateItemsImpl({ db, actor: { id: context.session.user.id }, input: data })
	)
