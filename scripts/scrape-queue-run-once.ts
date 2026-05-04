/**
 * One-shot scrape-queue runner. Drains pending `itemScrapeJobs` rows and
 * exits. Useful for local dev (no cron needed to see import progress)
 * and as the building block for self-hosted deployments running the
 * runner outside of an HTTP cron tick.
 *
 * Usage:
 *
 *   pnpm scrape-queue:run-once --userId=<userId>            # one user
 *   pnpm scrape-queue:run-once --all                        # everyone with pending jobs
 *   pnpm scrape-queue:run-once --all --usersPerInvocation=50
 *
 * Calls the same `processForUser` / `processOnce` entry points the cron
 * endpoint does, so the per-user advisory lock + skip-state semantics
 * are identical no matter which trigger drives a run.
 */

import { parseArgs } from 'node:util'

import { db } from '@/db'
import { processForUser, processOnce } from '@/lib/import/scrape-queue/runner'

async function main() {
	const { values } = parseArgs({
		options: {
			userId: { type: 'string' },
			all: { type: 'boolean' },
			usersPerInvocation: { type: 'string' },
			trigger: { type: 'string' },
		},
	})

	const triggerArg = values.trigger ?? 'manual'
	if (triggerArg !== 'manual' && triggerArg !== 'cron') {
		console.error('--trigger must be "manual" or "cron"')
		process.exit(1)
	}
	const trigger: 'manual' | 'cron' = triggerArg

	if (values.userId) {
		const r = await processForUser(db, values.userId, { trigger })
		console.log(`${values.userId}:`, r)
		process.exit(r.status === 'error' ? 1 : 0)
	}

	if (values.all) {
		const usersPerInvocation = Math.max(1, Math.min(500, Number(values.usersPerInvocation ?? '50')))
		const r = await processOnce(db, { usersPerInvocation, trigger })
		console.log('done', r)
		process.exit(r.errors > 0 ? 1 : 0)
	}

	console.error('Provide --userId=<userId> or --all')
	process.exit(1)
}

void main()
