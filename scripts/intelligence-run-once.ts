/**
 * One-shot Intelligence runner. Generates recommendations for a single
 * user (or every user) and exits. Useful for local debugging and as the
 * building block for any external trigger (Shape B/C in the deployment
 * docs - see `.notes/plans/2026-05-intelligence-recommendations.md`).
 *
 * Usage:
 *
 *   pnpm intelligence:run-once --userId=<uuid>      # one user
 *   pnpm intelligence:run-once --all                # everyone, sequentially
 *   pnpm intelligence:run-once --all --concurrency=3
 *
 * Calls the same `generateForUser` entry point as the cron endpoint and
 * server function, so the per-user advisory lock + skip-state semantics
 * are identical no matter which trigger drives a run.
 */

import { parseArgs } from 'node:util'

import { db } from '@/db'
import { users } from '@/db/schema'
import { generateForUser } from '@/lib/intelligence/runner'

async function main() {
	const { values } = parseArgs({
		options: {
			userId: { type: 'string' },
			all: { type: 'boolean' },
			concurrency: { type: 'string' },
			trigger: { type: 'string' },
		},
	})

	const triggerArg = values.trigger ?? 'manual'
	if (triggerArg !== 'manual' && triggerArg !== 'cron') {
		console.error('--trigger must be "manual" or "cron"')
		process.exit(1)
	}
	const trigger: 'manual' | 'cron' = triggerArg

	let userIds: Array<string>
	if (values.userId) {
		userIds = [values.userId]
	} else if (values.all) {
		const rows = await db.select({ id: users.id }).from(users)
		userIds = rows.map(r => r.id)
	} else {
		console.error('Provide --userId=<uuid> or --all')
		process.exit(1)
	}

	const concurrency = Math.max(1, Math.min(20, Number(values.concurrency ?? '1')))
	const summary = { processed: 0, success: 0, skipped: 0, error: 0 }
	let cursor = 0

	await Promise.all(
		Array.from({ length: Math.min(concurrency, userIds.length) }, async () => {
			while (cursor < userIds.length) {
				const i = cursor++
				const userId = userIds[i]
				try {
					const result = await generateForUser(db, userId, { trigger, respectUnreadGuard: trigger === 'cron' })
					summary.processed++
					if (result.status === 'success') summary.success++
					else if (result.status === 'skipped') summary.skipped++
					else summary.error++
					console.log(`[${i + 1}/${userIds.length}] ${userId}: ${result.status}${'reason' in result ? ` (${result.reason})` : ''}`)
				} catch (err) {
					summary.processed++
					summary.error++
					console.error(`[${i + 1}/${userIds.length}] ${userId}: ${err instanceof Error ? err.message : String(err)}`)
				}
			}
		})
	)

	console.log('done', summary)
	process.exit(summary.error > 0 ? 1 : 0)
}

void main()
