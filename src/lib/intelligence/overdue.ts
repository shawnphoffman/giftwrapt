// Single source of truth for "which users are due for an intelligence
// refresh". Shared by the cron selector (`runIntelligenceRecommendations`)
// and the admin "Overdue" queue stat so the two can never drift - a prior
// version computed the admin count as "all non-banned users" while the cron
// selected on a different predicate, which made the dashboard claim work was
// pending that the cron would never pick up.
//
// A user is overdue when they're not banned AND their most recent SUCCESSFUL
// run finished longer ago than the refresh interval (or they've never had
// one). Engagement is intentionally NOT a factor: recs regenerate on the
// interval whether or not the user has read the prior batch.

import { and, count, eq, isNull, lt, or, sql } from 'drizzle-orm'

import { db } from '@/db'
import { recommendationRuns, users } from '@/db/schema'

function overdueCutoff(refreshIntervalDays: number): Date {
	return new Date(Date.now() - refreshIntervalDays * 86400000)
}

// Latest successful-run finish time per user. Built fresh per call so the
// alias can't be shared across two query builders.
function lastSuccessSubquery() {
	return db
		.select({
			userId: recommendationRuns.userId,
			finishedAt: sql<Date | null>`max(${recommendationRuns.finishedAt})`.as('finished_at'),
		})
		.from(recommendationRuns)
		.where(eq(recommendationRuns.status, 'success'))
		.groupBy(recommendationRuns.userId)
		.as('last_success')
}

// The cron's batch picker: returns up to `limit` overdue user ids (oldest
// last-success first, never-run users first) plus the full overdue total via
// a window count so the caller can report how many remain after this batch.
export async function selectOverdueUsers(
	refreshIntervalDays: number,
	limit: number
): Promise<{ ids: Array<string>; totalOverdue: number }> {
	const cutoff = overdueCutoff(refreshIntervalDays)
	const lastSuccess = lastSuccessSubquery()

	const rows = await db
		.select({
			id: users.id,
			total: sql<number>`count(*) over()`.mapWith(Number),
		})
		.from(users)
		.leftJoin(lastSuccess, eq(lastSuccess.userId, users.id))
		.where(and(eq(users.banned, false), or(isNull(lastSuccess.finishedAt), lt(lastSuccess.finishedAt, cutoff))))
		.orderBy(sql`${lastSuccess.finishedAt} asc nulls first`)
		.limit(limit)

	return { ids: rows.map(r => r.id), totalOverdue: rows[0]?.total ?? 0 }
}

// The admin "Overdue" stat: the full count the cron would eventually work
// through, using the exact same eligibility predicate as `selectOverdueUsers`.
export async function countOverdueUsers(refreshIntervalDays: number): Promise<number> {
	const cutoff = overdueCutoff(refreshIntervalDays)
	const lastSuccess = lastSuccessSubquery()

	const rows = await db
		.select({ n: count() })
		.from(users)
		.leftJoin(lastSuccess, eq(lastSuccess.userId, users.id))
		.where(and(eq(users.banned, false), or(isNull(lastSuccess.finishedAt), lt(lastSuccess.finishedAt, cutoff))))

	return rows[0]?.n ?? 0
}
