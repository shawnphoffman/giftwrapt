import { index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

import { users } from './users'

// =====================================================================
// AI USAGE (one row per model call)
// =====================================================================
//
// The ledger behind the admin "what is AI costing us" view. Every model
// call in the app goes through `src/lib/ai-call.ts`, which writes one row
// here whether the call succeeded or failed. Intelligence also keeps its
// own per-step rows (`recommendation_run_steps`) for prompt debugging;
// this table is the cross-feature total.
//
// Never holds prompt or response text: only who, which feature, which
// model, and how much. Rows are swept by the daily cleanup cron after
// `aiUsageRetentionDays`.

export const aiUsage = pgTable(
	'ai_usage',
	{
		id: serial('id').primaryKey(),
		// Stable feature label, e.g. 'scrape-provider', 'clean-title',
		// 'photo-extract', 'intelligence', 'admin-test'. See AiFeature in
		// src/lib/ai-call.ts.
		feature: text('feature').notNull(),
		model: text('model'),
		// The user the call was made for. Null for calls with no user in
		// scope (queue-driven scrapes) and after the user is deleted.
		userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
		tokensIn: integer('tokens_in').default(0).notNull(),
		tokensOut: integer('tokens_out').default(0).notNull(),
		cachedInputTokens: integer('cached_input_tokens').default(0).notNull(),
		// Estimate in micro-USD (USD * 1_000_000); see src/lib/ai-cost.ts.
		estimatedCostMicroUsd: integer('estimated_cost_micro_usd').default(0).notNull(),
		latencyMs: integer('latency_ms').default(0).notNull(),
		// Where the call was started from: 'web', 'mcp', 'mobile', 'import',
		// 'cron', 'admin', or 'cli' (AiCallSource in src/lib/ai-call.ts). Null
		// on rows written before the column existed.
		source: text('source'),
		// 'ok' | 'error'. A failed call still gets a row (zero tokens) so
		// the admin view can show error rates per feature.
		outcome: text('outcome').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	},
	table => [
		index('ai_usage_created_at_idx').on(table.createdAt),
		index('ai_usage_feature_created_at_idx').on(table.feature, table.createdAt),
	]
)

export type AiUsageRow = typeof aiUsage.$inferSelect
