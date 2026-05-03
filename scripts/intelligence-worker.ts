/**
 * Long-lived Intelligence worker. Polls the DB for users overdue for a
 * recommendation refresh and runs them with concurrency. Intended as the
 * entrypoint of a separate Docker service for self-hosters who want to
 * decouple background work from the web tier (Shape C in the deployment
 * docs).
 *
 * Usage:
 *
 *   pnpm intelligence:worker                # production loop
 *   pnpm intelligence:worker --once         # run a single tick and exit
 *   pnpm intelligence:worker --interval=30  # tick every 30s (default 60)
 *
 * Calls the same `generateForUser` entry point as the cron endpoint, so
 * per-user advisory locks make it safe to run alongside (or instead of)
 * the bundled HTTP cron.
 */

import { parseArgs } from 'node:util'

import { and, eq, isNull, lt, notExists, or, sql } from 'drizzle-orm'

import { db } from '@/db'
import { recommendationRuns, recommendations, users } from '@/db/schema'
import { generateForUser } from '@/lib/intelligence/runner'
import { getAppSettings } from '@/lib/settings-loader'

async function selectOverdueUsers(refreshIntervalDays: number, limit: number): Promise<Array<string>> {
	const cutoff = new Date(Date.now() - refreshIntervalDays * 86400000)

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
		.where(
			and(
				eq(users.banned, false),
				notExists(
					db
						.select({ id: recommendations.userId })
						.from(recommendations)
						.where(and(eq(recommendations.userId, users.id), eq(recommendations.status, 'active')))
				),
				or(isNull(lastSuccess.finishedAt), lt(lastSuccess.finishedAt, cutoff))
			)
		)
		.orderBy(sql`${lastSuccess.finishedAt} asc nulls first`)
		.limit(limit)

	return rows.map(r => r.id)
}

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

async function tick() {
	const settings = await getAppSettings(db)
	if (!settings.intelligenceEnabled) {
		console.log('skipped: intelligence disabled in settings')
		return
	}
	const userIds = await selectOverdueUsers(settings.intelligenceRefreshIntervalDays, settings.intelligenceUsersPerInvocation)
	if (userIds.length === 0) {
		console.log('nothing to do')
		return
	}
	console.log(`processing ${userIds.length} users`)
	const results = await runWithConcurrency(userIds, settings.intelligenceConcurrency, async userId => {
		try {
			return await generateForUser(db, userId, { trigger: 'cron' })
		} catch (err) {
			return { status: 'error' as const, runId: null, error: err instanceof Error ? err.message : String(err) }
		}
	})
	const summary = results.reduce(
		(acc, r) => {
			if (r.status === 'success') acc.success++
			else if (r.status === 'error') acc.error++
			else acc.skipped++
			return acc
		},
		{ success: 0, skipped: 0, error: 0 }
	)
	console.log('tick complete', summary)
}

async function main() {
	const { values } = parseArgs({
		options: {
			once: { type: 'boolean' },
			interval: { type: 'string' },
		},
	})

	const intervalSec = Math.max(5, Number(values.interval ?? '60'))

	if (values.once) {
		await tick()
		process.exit(0)
	}

	console.log(`intelligence-worker starting; tick every ${intervalSec}s`)
	const state = { stopping: false }
	const stop = () => {
		console.log('shutdown requested')
		state.stopping = true
	}
	process.on('SIGINT', stop)
	process.on('SIGTERM', stop)

	for (;;) {
		// state.stopping is mutated by SIGINT/SIGTERM handlers
		if ((state as { stopping: boolean }).stopping) break
		try {
			await tick()
		} catch (err) {
			console.error('tick failed', err)
		}
		if ((state as { stopping: boolean }).stopping) break
		await new Promise(r => setTimeout(r, intervalSec * 1000))
	}
	process.exit(0)
}

void main()
