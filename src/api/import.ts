// Server-fn surface for the bulk-import flow. Mirrors the items.ts
// pattern: the impl lives in `_import-impl.ts` so the static import
// chain (db, drizzle, scrape-queue runner) stays out of the client
// bundle.

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { db } from '@/db'
import { fetchAmazonWishlist, type FetchAmazonWishlistResult } from '@/lib/import/parsers/amazon-wishlist-fetch'
import { loggingMiddleware } from '@/lib/logger'
import { authMiddleware } from '@/middleware/auth'

import { bulkCreateItemsImpl, BulkCreateItemsInputSchema, type BulkCreateItemsResult } from './_import-impl'

export type { BulkCreateItemsResult, ItemDraft } from './_import-impl'
export type { FetchAmazonWishlistResult } from '@/lib/import/parsers/amazon-wishlist-fetch'

export const bulkCreateItems = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof BulkCreateItemsInputSchema>) => BulkCreateItemsInputSchema.parse(data))
	.handler(
		({ context, data }): Promise<BulkCreateItemsResult> => bulkCreateItemsImpl({ db, actor: { id: context.session.user.id }, input: data })
	)

// Fetch and parse an external import source server-side. Currently only
// Amazon wishlists; the union shape exists so we can add more (Etsy,
// Target, etc.) without refactoring the client. No list permission
// check happens here - the bulk-create call later does the gate, so
// previewing drafts is intentionally a low-friction step.
const FetchImportSourceInputSchema = z.discriminatedUnion('source', [
	z.object({ source: z.literal('amazon-wishlist'), url: z.string().url().max(2000) }),
])

export const fetchImportSource = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof FetchImportSourceInputSchema>) => FetchImportSourceInputSchema.parse(data))
	.handler(({ data }): Promise<FetchAmazonWishlistResult> => fetchAmazonWishlist(data.url))
