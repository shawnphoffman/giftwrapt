import { jsonb, pgTable, text } from 'drizzle-orm/pg-core'

import { timestamps } from './shared'

// =====================================================================
// PRODUCT LOOKUPS (barcode cache)
// =====================================================================
// Keyed by the normalized GTIN-14 so length variants of the same code
// (UPC-E / UPC-A / EAN-13 / etc.) collapse to a single row. `results`
// holds the provider-normalized array (0:N candidates). `providerId`
// records the fetcher that produced the row so a cache hit can be
// attributed correctly even when the admin has since flipped providers.
//
// Independent from URL scraping: no FK to items / itemScrapes, never
// surfaces in scrape history. Lifecycle is "fetch on miss; refresh
// when older than `barcode.cacheTtlHours`."

export interface BarcodeCacheCandidate {
	title?: string
	brand?: string
	imageUrl?: string
	candidateUrl?: string
}

export const productLookups = pgTable('product_lookups', {
	code: text('code').primaryKey(),
	providerId: text('provider_id').notNull(),
	results: jsonb('results').$type<Array<BarcodeCacheCandidate>>().notNull(),
	...timestamps,
})

export type ProductLookup = typeof productLookups.$inferSelect
export type NewProductLookup = typeof productLookups.$inferInsert
