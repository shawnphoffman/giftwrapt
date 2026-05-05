// Single source of truth for what each `/api/cron/*` endpoint does.
// Both the HTTP route handlers and the admin "Run now" server fn call
// these so the inline body never drifts between trigger paths. Each
// handler is wrapped by `recordCronRun()` at the call site, so they
// just return their result shape (with optional `skipped: <reason>`).

import { and, eq, isNull, lt, notExists, or, sql } from 'drizzle-orm'

import { db } from '@/db'
import { recommendationRuns, recommendationRunSteps, recommendations, users } from '@/db/schema'
import { autoArchiveImpl } from '@/lib/cron/auto-archive'
import { birthdayEmailsImpl } from '@/lib/cron/birthday-emails'
import { cleanupVerificationImpl } from '@/lib/cron/cleanup-verification'
import { sweepCronRuns } from '@/lib/cron/record-run'
import type { CronEndpoint } from '@/lib/cron/registry'
import { processOnce } from '@/lib/import/scrape-queue/runner'
import { generateForUser } from '@/lib/intelligence/runner'
import { createLogger } from '@/lib/logger'
import { isEmailConfigured } from '@/lib/resend'
import { getAppSettings } from '@/lib/settings-loader'

const log = createLogger('cron:handlers')

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

async function selectOverdueUsers(refreshIntervalDays: number, limit: number): Promise<{ ids: Array<string>; totalOverdue: number }> {
	const cutoff = new Date(Date.now() - refreshIntervalDays * 86400000)

	const hasActiveRecs = db
		.select({ userId: recommendations.userId })
		.from(recommendations)
		.where(and(eq(recommendations.userId, users.id), eq(recommendations.status, 'active')))

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
		.select({
			id: users.id,
			total: sql<number>`count(*) over()`.mapWith(Number),
		})
		.from(users)
		.leftJoin(lastSuccess, eq(lastSuccess.userId, users.id))
		.where(and(eq(users.banned, false), notExists(hasActiveRecs), or(isNull(lastSuccess.finishedAt), lt(lastSuccess.finishedAt, cutoff))))
		.orderBy(sql`${lastSuccess.finishedAt} asc nulls first`)
		.limit(limit)

	return { ids: rows.map(r => r.id), totalOverdue: rows[0]?.total ?? 0 }
}

async function runIntelligenceRetentionSweep(args: { recDays: number; stepDays: number }) {
	const recCutoff = new Date(Date.now() - args.recDays * 86400000)
	const stepCutoff = new Date(Date.now() - args.stepDays * 86400000)
	const recRows = await db.delete(recommendations).where(lt(recommendations.createdAt, recCutoff)).returning({ id: recommendations.id })
	const stepRows = await db
		.delete(recommendationRunSteps)
		.where(lt(recommendationRunSteps.createdAt, stepCutoff))
		.returning({ id: recommendationRunSteps.id })
	return { recsDeleted: recRows.length, stepsDeleted: stepRows.length }
}

export async function runAutoArchive() {
	const started = Date.now()
	const settings = await getAppSettings(db)
	const now = new Date()

	const { birthdayArchived, christmasArchived } = await autoArchiveImpl({
		db,
		now,
		archiveDaysAfterBirthday: settings.archiveDaysAfterBirthday,
		archiveDaysAfterChristmas: settings.archiveDaysAfterChristmas,
	})

	const durationMs = Date.now() - started
	log.info({ endpoint: '/api/cron/auto-archive', birthdayArchived, christmasArchived, durationMs }, 'cron run complete')

	return {
		ok: true,
		birthdayArchived,
		christmasArchived,
		settings: {
			archiveDaysAfterBirthday: settings.archiveDaysAfterBirthday,
			archiveDaysAfterChristmas: settings.archiveDaysAfterChristmas,
		},
		date: now.toISOString(),
	}
}

export async function runBirthdayEmails() {
	const started = Date.now()

	if (!(await isEmailConfigured())) {
		return { ok: true, skipped: 'email-not-configured', date: new Date().toISOString() }
	}

	const settings = await getAppSettings(db)
	if (!settings.enableBirthdayEmails) {
		return { ok: true, skipped: 'disabled', date: new Date().toISOString() }
	}

	const now = new Date()
	const { birthdayEmails, followUpEmails } = await birthdayEmailsImpl({ db, now })
	const durationMs = Date.now() - started
	log.info({ endpoint: '/api/cron/birthday-emails', birthdayEmails, followUpEmails, durationMs }, 'cron run complete')

	return { ok: true, birthdayEmails, followUpEmails, date: now.toISOString() }
}

export async function runCleanupVerification() {
	const started = Date.now()
	const settings = await getAppSettings(db)
	const { deleted } = await cleanupVerificationImpl({ db, now: new Date() })
	const cronRunsSweep = await sweepCronRuns({ retentionDays: settings.cronRunsRetentionDays })
	const durationMs = Date.now() - started
	log.info({ endpoint: '/api/cron/cleanup-verification', deleted, cronRunsSweep, durationMs }, 'cleanup complete')

	return { ok: true, deleted, cronRunsSweep, durationMs }
}

export async function runIntelligenceRecommendations() {
	const started = Date.now()
	const settings = await getAppSettings(db)
	if (!settings.intelligenceEnabled) {
		return { ok: true, skipped: 'disabled', date: new Date().toISOString() }
	}

	const { ids: userIds, totalOverdue } = await selectOverdueUsers(
		settings.intelligenceRefreshIntervalDays,
		settings.intelligenceUsersPerInvocation
	)

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
				log.error({ userId, err: msg }, 'unexpected error generating for user')
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

	const retention = await runIntelligenceRetentionSweep({
		recDays: settings.intelligenceStaleRecRetentionDays,
		stepDays: settings.intelligenceRunStepsRetentionDays,
	})

	const remaining = Math.max(0, totalOverdue - userIds.length)

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
	log.info({ endpoint: '/api/cron/intelligence-recommendations', ...summary }, 'cron run complete')
	return summary
}

export async function runItemScrapeQueue() {
	const started = Date.now()
	const settings = await getAppSettings(db)
	if (!settings.importEnabled) {
		return { ok: true, skipped: 'disabled', date: new Date().toISOString() }
	}

	const summary = await processOnce(db, { usersPerInvocation: settings.scrapeQueueUsersPerInvocation })
	const out = { ok: true, ...summary, durationMs: Date.now() - started }
	log.info({ endpoint: '/api/cron/item-scrape-queue', ...out }, 'cron run complete')
	return out
}

export const cronHandlers: Record<CronEndpoint, () => Promise<Record<string, unknown>>> = {
	'/api/cron/auto-archive': runAutoArchive,
	'/api/cron/birthday-emails': runBirthdayEmails,
	'/api/cron/cleanup-verification': runCleanupVerification,
	'/api/cron/intelligence-recommendations': runIntelligenceRecommendations,
	'/api/cron/item-scrape-queue': runItemScrapeQueue,
}
