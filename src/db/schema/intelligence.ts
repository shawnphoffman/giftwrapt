import { sql } from 'drizzle-orm'
import { index, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { dependents } from './dependents'
import { users } from './users'

// ===============================
// INTELLIGENCE / RECOMMENDATIONS
// ===============================
//
// Per-user AI-assisted recommendations: stale items, duplicates, list
// hygiene, etc. Generated on a schedule + manual refresh; persisted so
// reads are cheap and engagement (dismiss / apply) is sticky across
// regenerations via `fingerprint`.
//
// Spoiler-protection rule: never write claim (`giftedItems`) data into
// `recommendations.body` or `recommendationRunSteps.prompt` /
// `responseRaw`. The recipient is the only viewer of their own recs and
// the recipient also can't see claims pre-reveal, so leakage in the
// rec body would be a regression.

export const recommendationStatusEnumValues = ['active', 'dismissed', 'applied'] as const
export const recommendationStatusEnum = pgEnum('recommendation_status', recommendationStatusEnumValues)
export type RecommendationStatus = (typeof recommendationStatusEnumValues)[number]

export const recommendationSeverityEnumValues = ['info', 'suggest', 'important'] as const
export const recommendationSeverityEnum = pgEnum('recommendation_severity', recommendationSeverityEnumValues)
export type RecommendationSeverity = (typeof recommendationSeverityEnumValues)[number]

export const recommendationRunStatusEnumValues = ['running', 'success', 'error', 'skipped'] as const
export const recommendationRunStatusEnum = pgEnum('recommendation_run_status', recommendationRunStatusEnumValues)
export type RecommendationRunStatus = (typeof recommendationRunStatusEnumValues)[number]

export const recommendationRunTriggerEnumValues = ['cron', 'manual'] as const
export const recommendationRunTriggerEnum = pgEnum('recommendation_run_trigger', recommendationRunTriggerEnumValues)
export type RecommendationRunTrigger = (typeof recommendationRunTriggerEnumValues)[number]

export const recommendations = pgTable(
	'recommendations',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		// When set, the rec is scoped to one of the user's dependents (the
		// user is the guardian; the dependent is the gift recipient). When
		// null, the rec is about the user's own lists. Recs scope is part of
		// the fingerprint so a stale-items rec for the user and the same
		// shape for a dependent never collide on dedup.
		dependentId: text('dependent_id').references(() => dependents.id, { onDelete: 'cascade' }),
		// All recs from one generation run share a batchId so admins can scope
		// "what came out of this run" without reconstructing from timestamps.
		batchId: uuid('batch_id').notNull(),
		// Which analyzer produced this rec (e.g. 'primary-list', 'stale-items').
		// Free-form so new analyzers can be added without a DB migration.
		analyzerId: text('analyzer_id').notNull(),
		// Analyzer-specific subtype (e.g. 'old-items', 'cross-list-duplicate').
		kind: text('kind').notNull(),
		// Stable hash of (analyzerId + kind + sorted target ids). Used to
		// preserve dismissals across regenerations: when a new batch produces
		// a rec with the same fingerprint as a prior dismissed rec, we carry
		// the dismissed status forward instead of re-creating as active.
		fingerprint: text('fingerprint').notNull(),
		status: recommendationStatusEnum('status').default('active').notNull(),
		severity: recommendationSeverityEnum('severity').default('suggest').notNull(),
		title: text('title').notNull(),
		// Short rationale shown to the user. NEVER references claim data.
		body: text('body').notNull(),
		// Type-specific structured data (item ids, list ids, suggested action,
		// affected summary, ordered actions, etc).
		payload: jsonb('payload').notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		dismissedAt: timestamp('dismissed_at'),
	},
	table => [
		index('recommendations_user_status_created_idx').on(table.userId, table.status, table.createdAt.desc()),
		index('recommendations_user_batch_idx').on(table.userId, table.batchId),
		index('recommendations_user_fingerprint_idx').on(table.userId, table.fingerprint),
		// Lets the user-facing suggestions page split recs into "mine" vs
		// "for my dependents" without scanning the full set per user.
		index('recommendations_user_dependent_status_idx').on(table.userId, table.dependentId, table.status),
	]
)

export type Recommendation = typeof recommendations.$inferSelect
export type NewRecommendation = typeof recommendations.$inferInsert

export const recommendationRuns = pgTable(
	'recommendation_runs',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		startedAt: timestamp('started_at').defaultNow().notNull(),
		finishedAt: timestamp('finished_at'),
		status: recommendationRunStatusEnum('status').default('running').notNull(),
		trigger: recommendationRunTriggerEnum('trigger').notNull(),
		// e.g. 'unchanged-input', 'unread-recs-exist', 'lock-held', 'disabled',
		// 'no-provider'. Null when status != 'skipped'.
		skipReason: text('skip_reason'),
		// Captured error message when status === 'error'.
		error: text('error'),
		// Combined hash of all enabled-analyzer input slices. Used to skip
		// regeneration when nothing has changed since the last successful run.
		inputHash: text('input_hash'),
		// Token totals across all analyzers for quick admin rollups.
		tokensIn: integer('tokens_in').default(0).notNull(),
		tokensOut: integer('tokens_out').default(0).notNull(),
		// Estimated cost in USD * 1000000 (micro-dollars) so we can store as
		// integer and avoid float drift. Rendered as / 1_000_000 in the UI.
		estimatedCostMicroUsd: integer('estimated_cost_micro_usd').default(0).notNull(),
	},
	table => [
		index('recommendation_runs_user_started_idx').on(table.userId, table.startedAt.desc()),
		index('recommendation_runs_status_started_idx').on(table.status, table.startedAt.desc()),
	]
)

export type RecommendationRun = typeof recommendationRuns.$inferSelect
export type NewRecommendationRun = typeof recommendationRuns.$inferInsert

export const recommendationRunSteps = pgTable(
	'recommendation_run_steps',
	{
		id: serial('id').primaryKey(),
		runId: uuid('run_id')
			.notNull()
			.references(() => recommendationRuns.id, { onDelete: 'cascade' }),
		// Analyzer id (e.g. 'stale-items'). Free-form to match
		// `recommendations.analyzerId`.
		analyzer: text('analyzer').notNull(),
		// Prompt sent to the model. Bounded to the candidate set, never the
		// user's full library, never claim data. May be null for heuristic-only
		// analyzers (e.g. 'primary-list').
		prompt: text('prompt'),
		responseRaw: text('response_raw'),
		// Zod-parsed structured output, or the validation error.
		parsed: jsonb('parsed'),
		tokensIn: integer('tokens_in').default(0).notNull(),
		tokensOut: integer('tokens_out').default(0).notNull(),
		latencyMs: integer('latency_ms').default(0).notNull(),
		error: text('error'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
	},
	table => [index('recommendation_run_steps_run_idx').on(table.runId), index('recommendation_run_steps_created_idx').on(table.createdAt)]
)

export type RecommendationRunStep = typeof recommendationRunSteps.$inferSelect
export type NewRecommendationRunStep = typeof recommendationRunSteps.$inferInsert

// Convenience: SQL fragment for the per-user advisory lock key. Postgres
// `pg_try_advisory_lock(bigint)` requires an int8; hash the user id so
// concurrent runs for the same user collide and runs for different users
// don't.
export function intelligenceLockKeySql(userId: string) {
	return sql`hashtextextended(${`intelligence:${userId}`}, 0)`
}
