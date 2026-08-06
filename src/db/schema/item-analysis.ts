import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'

import { items } from './items'
import { timestamps } from './shared'
import { users } from './users'

// =====================================================================
// ITEM AI ANALYSIS (per-item enrichment facets)
// =====================================================================
//
// One row per item: AI-derived facets (category, clothing flags, canonical
// product identity) computed once per content version instead of on every
// intelligence run. Analyzers read these facets from the DB; the model is
// only consulted when an item is new, its content changed (`contentHash`
// mismatch via `items.modifiedAt`), or the extraction prompt/schema was
// revised (`analysisVersion` bump).
//
// Spoiler-protection rule: enrichment inputs are ONLY item title / notes /
// url. Claim (`giftedItems`) data must never reach the enrichment prompt
// or be derivable from any column here.

export const itemAiAnalysis = pgTable(
	'item_ai_analysis',
	{
		itemId: integer('item_id')
			.primaryKey()
			.references(() => items.id, { onDelete: 'cascade' }),
		// sha256 of the enrichment inputs (title | notes | url) at analysis
		// time. Lets consumers detect facet rows that lag an item edit.
		contentHash: text('content_hash').notNull(),
		// Version of the extraction prompt/schema that produced this row.
		// Bump ANALYSIS_VERSION (src/lib/intelligence/enrichment.ts) to
		// lazily re-enrich the fleet: the sweep re-selects rows with an
		// older version, bounded per run, so a new facet backfills over a
		// few cron cycles instead of one expensive burst.
		analysisVersion: integer('analysis_version').notNull(),
		// Model name that produced the row, for admin debugging/cost review.
		model: text('model'),
		// Coarse taxonomy slug from the fixed list in prompts/enrichment.ts
		// ('clothing', 'electronics', ...; 'other' when nothing fits).
		category: text('category'),
		// Clothing facets consumed by the clothing-prefs analyzer. hasSize /
		// hasColor mean the title/notes already pin the preference down.
		isClothing: boolean('is_clothing').default(false).notNull(),
		hasSize: boolean('has_size').default(false).notNull(),
		hasColor: boolean('has_color').default(false).notNull(),
		// One-sentence "what's missing" rationale for clothing items; shown
		// as the muted detail line on clothing-prefs sub-rows. Null for
		// non-clothing items.
		sizingRationale: text('sizing_rationale'),
		// Generic option slates a gifter would shop for (never SKU-specific).
		suggestedSizes: jsonb('suggested_sizes').$type<Array<string>>(),
		suggestedColors: jsonb('suggested_colors').$type<Array<string>>(),
		// Normalized product identity: lowercase brand + product with
		// size/color/quantity/SKU disambiguators dropped. Equal canonical
		// names across lists are treated as confident duplicates.
		canonicalName: text('canonical_name'),
		// Open-ended bag for facets added later without a migration.
		attributes: jsonb('attributes').$type<Record<string, unknown>>(),
		...timestamps,
	},
	table => [
		// Supports the duplicates analyzer's canonical-name tier lookups.
		index('item_ai_analysis_canonical_idx').on(table.canonicalName),
	]
)

export type ItemAiAnalysis = typeof itemAiAnalysis.$inferSelect
export type NewItemAiAnalysis = typeof itemAiAnalysis.$inferInsert

// =====================================================================
// INTELLIGENCE VERDICTS (memoized model judgments)
// =====================================================================
//
// Caches individual model judgments that depend only on item text, so a
// slightly-changed candidate set (one new item) re-asks the model about
// the new pairs/clusters only, not the whole slate.
//
//   kind 'duplicate-pair':   key = hash of the two normalized titles;
//                            verdict = { matched, confident, rationale }
//   kind 'grouping-cluster': key = hash of sorted member titles;
//                            verdict = { decision, orderedTitles, rationale }
//
// Rows are per-user (titles are user content; no cross-user reuse) and
// swept after VERDICT_RETENTION_DAYS by the intelligence retention sweep.
// A title edit changes the key, so invalidation is automatic and stale
// rows simply age out.

export const intelligenceVerdicts = pgTable(
	'intelligence_verdicts',
	{
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		kind: text('kind').notNull(),
		key: text('key').notNull(),
		verdict: jsonb('verdict').$type<Record<string, unknown>>().notNull(),
		model: text('model'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
	},
	table => [
		primaryKey({ columns: [table.userId, table.kind, table.key] }),
		// Drives the retention sweep.
		index('intelligence_verdicts_created_idx').on(table.createdAt),
	]
)

export type IntelligenceVerdict = typeof intelligenceVerdicts.$inferSelect
export type NewIntelligenceVerdict = typeof intelligenceVerdicts.$inferInsert
