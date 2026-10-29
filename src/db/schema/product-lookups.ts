import { index, integer, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

import { timestamps } from './shared'
import { users } from './users'

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

// =====================================================================
// BARCODE LOOKUP HISTORY (one row per lookup request)
// =====================================================================
// The log behind the Lookup History card on /admin/barcode. Every call
// to `lookupProductByBarcodeImpl` past the enabled check writes one row,
// whatever the outcome: cache hits, provider hits, misses, provider
// failures, and malformed codes. The admin per-provider tester does not
// write here. Nothing reads it to decide what to do. Rows are swept by
// the daily cleanup cron after `barcodeLookupHistoryRetentionDays`.

export const barcodeLookupHistory = pgTable(
	'barcode_lookup_history',
	{
		id: serial('id').primaryKey(),
		// Null after the user is deleted.
		userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
		// The code exactly as the client sent it.
		rawCode: text('raw_code').notNull(),
		// Null when the code didn't normalize (outcome 'invalid-code').
		gtin14: text('gtin14'),
		// 'ok' | 'not-found' | 'provider-unavailable' | 'invalid-code'.
		outcome: text('outcome').notNull(),
		// 'cache' | 'provider' on an ok row, null otherwise.
		source: text('source'),
		// The provider that answered (or missed, or threw). Null when no
		// provider was reached.
		providerId: text('provider_id'),
		results: jsonb('results').$type<Array<BarcodeCacheCandidate>>(),
		// The provider's thrown message on 'provider-unavailable'.
		errorMessage: text('error_message'),
		ms: integer('ms'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	},
	table => [index('barcode_lookup_history_created_at_idx').on(table.createdAt)]
)

export type BarcodeLookupHistoryRow = typeof barcodeLookupHistory.$inferSelect
