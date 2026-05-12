import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// ===============================
// CRON RUN HISTORY
// ===============================
//
// One row per invocation of every `/api/cron/*` route. The row is
// inserted at handler start (status=running) and updated to
// success/error/skipped at handler exit. Powers /admin/scheduling so
// operators can see whether their scheduler is firing each endpoint and
// what the last few runs returned.
//
// `endpoint` is the route path (e.g. '/api/cron/auto-archive'). Free-
// form text so a new cron route doesn't need a migration; the registry
// in `src/lib/cron/registry.ts` is the source of truth for which paths
// are valid.
//
// `summary` captures the per-endpoint structured result (counts of
// archived items, processed users, etc) so the admin page can show
// useful detail without a join. NEVER write claim-revealing data here;
// the admin page is read-only but still reachable by any admin.

export const cronRunStatusEnumValues = ['running', 'success', 'error', 'skipped'] as const
export const cronRunStatusEnum = pgEnum('cron_run_status', cronRunStatusEnumValues)
export type CronRunStatus = (typeof cronRunStatusEnumValues)[number]

export const cronRuns = pgTable(
	'cron_runs',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		endpoint: text('endpoint').notNull(),
		status: cronRunStatusEnum('status').default('running').notNull(),
		startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
		finishedAt: timestamp('finished_at', { withTimezone: true }),
		durationMs: integer('duration_ms'),
		// Populated when status='skipped' (e.g. 'disabled', 'email-not-configured').
		skipReason: text('skip_reason'),
		// Populated when status='error'.
		error: text('error'),
		// Per-endpoint structured result. Shape varies by route.
		// Typed as `Record<string, {}>` (non-null values) to satisfy the
		// tanstack-start server-fn serializer, which rejects `unknown`
		// in the return shape.
		summary: jsonb('summary').$type<Record<string, {}> | null>(),
	},
	table => [
		index('cron_runs_endpoint_started_idx').on(table.endpoint, table.startedAt.desc()),
		index('cron_runs_status_started_idx').on(table.status, table.startedAt.desc()),
		index('cron_runs_started_idx').on(table.startedAt.desc()),
	]
)

export type CronRun = typeof cronRuns.$inferSelect
export type NewCronRun = typeof cronRuns.$inferInsert
