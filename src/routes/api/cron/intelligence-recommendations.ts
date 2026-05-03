import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { and, count, eq, isNull, lt, notExists, or, sql } from 'drizzle-orm'

import { db } from '@/db'
import { recommendationRuns, recommendationRunSteps, recommendations, users } from '@/db/schema'
import { checkCronAuth } from '@/lib/cron-auth'
import { generateForUser } from '@/lib/intelligence/runner'
import { createLogger } from '@/lib/logger'
import { getAppSettings } from '@/lib/settings-loader'

const cronLog = createLogger('cron:intelligence')

// Picks users whose last *successful* run is older than refreshIntervalDays
// (or who have never run), AND who have zero active recs (the unread-recs
// guard at the SQL level so we don't even pick them up). Bounded by the
// admin-configured batch size.
async function selectOverdueUsers(refreshIntervalDays: number, limit: number): Promise<Array<string>> {
	const cutoff = new Date(Date.now() - refreshIntervalDays * 86400000)

	// Subquery: users with at least one active rec (skip these via NOT EXISTS).
	const hasActiveRecs = db
		.select({ userId: recommendations.userId })
		.from(recommendations)
		.where(and(eq(recommendations.userId, users.id), eq(recommendations.status, 'active')))

	// Subquery: most-recent successful run per user, gives the finishedAt cutoff.
	const lastSuccess = db
		.select({
			userId: recommendationRuns.userId,
			finishedAt: sql<Date | null>`max(${recommendationRuns.finishedAt})`.as('finished_at'),
		})
		.from(recommendationRuns)
		.where(eq(recommendationRuns.status, 'success'))
		.groupBy(recommendationRuns.userId)
		.as('last_success')

	const rows = await db
		.select({ id: users.id })
		.from(users)
		.leftJoin(lastSuccess, eq(lastSuccess.userId, users.id))
		.where(and(eq(users.banned, false), notExists(hasActiveRecs), or(isNull(lastSuccess.finishedAt), lt(lastSuccess.finishedAt, cutoff))))
		.orderBy(sql`${lastSuccess.finishedAt} asc nulls first`)
		.limit(limit)

	return rows.map(r => r.id)
}

// concurrency-bounded promise pool, no extra dependency
async function runWithConcurrency<TItem, TResult>(
	items: ReadonlyArray<TItem>,
	concurrency: number,
	worker: (item: TItem) => Promise<TResult>
): Promise<Array<TResult>> {
	const results: Array<TResult> = []
	let cursor = 0
	const lanes = Math.max(1, Math.min(concurrency, items.length))
	await Promise.all(
		Array.from({ length: lanes }, async () => {
			while (cursor < items.length) {
				const i = cursor++
				results[i] = await worker(items[i])
			}
		})
	)
	return results
}

async function runRetentionSweep(args: { recDays: number; stepDays: number }) {
	const recCutoff = new Date(Date.now() - args.recDays * 86400000)
	const stepCutoff = new Date(Date.now() - args.stepDays * 86400000)
	const recRows = await db.delete(recommendations).where(lt(recommendations.createdAt, recCutoff)).returning({ id: recommendations.id })
	const stepRows = await db
		.delete(recommendationRunSteps)
		.where(lt(recommendationRunSteps.createdAt, stepCutoff))
		.returning({ id: recommendationRunSteps.id })
	return { recsDeleted: recRows.length, stepsDeleted: stepRows.length }
}

export const Route = createFileRoute('/api/cron/intelligence-recommendations')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const started = Date.now()
				cronLog.info('cron run starting')

				const authError = checkCronAuth(request, cronLog)
				if (authError) return authError

				const settings = await getAppSettings(db)
				if (!settings.intelligenceEnabled) {
					cronLog.info('skipped: intelligence disabled in settings')
					return json({ ok: true, skipped: 'intelligence disabled', date: new Date().toISOString() })
				}

				const userIds = await selectOverdueUsers(settings.intelligenceRefreshIntervalDays, settings.intelligenceUsersPerInvocation)

				let succeeded = 0
				let skipped = 0
				let lockedOut = 0
				let failed = 0
				const skipCounts: Record<string, number> = {}

				if (userIds.length > 0) {
					const results = await runWithConcurrency(userIds, settings.intelligenceConcurrency, async userId => {
						try {
							return await generateForUser(db, userId, { trigger: 'cron' })
						} catch (err) {
							const msg = err instanceof Error ? err.message : String(err)
							cronLog.error({ userId, err: msg }, 'unexpected error generating for user')
							return { status: 'error' as const, runId: null, error: msg }
						}
					})

					for (const r of results) {
						if (r.status === 'success') succeeded++
						else if (r.status === 'error') failed++
						else {
							skipped++
							if (r.reason === 'lock-held') lockedOut++
							skipCounts[r.reason] = (skipCounts[r.reason] ?? 0) + 1
						}
					}
				}

				// Retention sweep + remaining-overdue probe (cheap count)
				const retention = await runRetentionSweep({
					recDays: settings.intelligenceStaleRecRetentionDays,
					stepDays: settings.intelligenceRunStepsRetentionDays,
				})

				const cutoff = new Date(Date.now() - settings.intelligenceRefreshIntervalDays * 86400000)
				const remainingRow = await db
					.select({ value: count() })
					.from(users)
					.where(
						and(
							eq(users.banned, false),
							notExists(
								db
									.select({ userId: recommendations.userId })
									.from(recommendations)
									.where(and(eq(recommendations.userId, users.id), eq(recommendations.status, 'active')))
							),
							or(
								notExists(
									db
										.select({ id: recommendationRuns.id })
										.from(recommendationRuns)
										.where(and(eq(recommendationRuns.userId, users.id), eq(recommendationRuns.status, 'success')))
								),
								// any successful run finished before the cutoff
								sql`exists (
									select 1 from ${recommendationRuns}
									where ${recommendationRuns.userId} = ${users.id}
									and ${recommendationRuns.status} = 'success'
									and ${recommendationRuns.finishedAt} < ${cutoff.toISOString()}
								)`
							)
						)
					)
				const remaining = Math.max(0, remainingRow[0].value - userIds.length)

				const summary = {
					ok: true,
					processed: userIds.length,
					succeeded,
					skipped,
					skipCounts,
					lockedOut,
					failed,
					remaining,
					retention,
					durationMs: Date.now() - started,
				}
				cronLog.info(summary, 'cron run complete')
				return json(summary)
			},
		},
	},
})
