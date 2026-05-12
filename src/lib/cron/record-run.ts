// Wrap a cron handler so each invocation gets a `cron_runs` row. The
// row is inserted at start (status='running') and updated on exit to
// success/error/skipped. Wraps the handler's return shape:
//
//   - Throw -> status='error', error=err.message
//   - Return { skipped: 'reason', ...rest } -> status='skipped',
//     skipReason='reason', summary=rest
//   - Otherwise -> status='success', summary=value
//
// The result of the wrapped handler is what gets serialized into the
// HTTP response, so the existing route shapes don't change.

import { eq, lt } from 'drizzle-orm'

import { db } from '@/db'
import { cronRuns } from '@/db/schema'
import { createLogger } from '@/lib/logger'

import type { CronEndpoint } from './registry'

const log = createLogger('cron:record-run')

type RecordCronRunOptions<T> = {
	endpoint: CronEndpoint
	run: () => Promise<T>
}

export async function recordCronRun<T extends Record<string, {}> | undefined>({ endpoint, run }: RecordCronRunOptions<T>): Promise<T> {
	const started = Date.now()
	const inserted = await db.insert(cronRuns).values({ endpoint, status: 'running' }).returning({ id: cronRuns.id })
	const runId = inserted[0]?.id

	try {
		const result = await run()
		const durationMs = Date.now() - started

		// Heuristic: any handler that wants to record "skipped" returns a
		// `skipped: <reason>` field. All five existing routes already follow
		// this convention.
		const skipReason = result && typeof result === 'object' && 'skipped' in result ? String(result.skipped) : null

		if (runId) {
			await db
				.update(cronRuns)
				.set({
					status: skipReason ? 'skipped' : 'success',
					finishedAt: new Date(),
					durationMs,
					skipReason,
					summary: result ?? null,
				})
				.where(eq(cronRuns.id, runId))
		}

		return result
	} catch (err) {
		const durationMs = Date.now() - started
		const message = err instanceof Error ? err.message : String(err)
		if (runId) {
			await db
				.update(cronRuns)
				.set({ status: 'error', finishedAt: new Date(), durationMs, error: message })
				.where(eq(cronRuns.id, runId))
				.catch(updateErr => {
					log.error({ updateErr: String(updateErr) }, 'failed to mark cron run errored')
				})
		}
		throw err
	}
}

// Retention sweep: delete cron_runs rows older than `retentionDays`.
// Called from the daily cleanup-verification cron so it shares an
// existing tick instead of needing its own schedule.
export async function sweepCronRuns(args: { retentionDays: number; now?: Date }) {
	const cutoff = new Date((args.now ?? new Date()).getTime() - args.retentionDays * 86_400_000)
	const rows = await db.delete(cronRuns).where(lt(cronRuns.startedAt, cutoff)).returning({ id: cronRuns.id })
	return { deleted: rows.length }
}
