// Single source of truth for what each `/api/cron/*` endpoint does.
// Both the HTTP route handlers and the admin "Run now" server fn call
// these so the inline body never drifts between trigger paths. Each
// handler is wrapped by `recordCronRun()` at the call site, so they
// just return their result shape (with optional `skipped: <reason>`).

import { lt } from 'drizzle-orm'

import { db } from '@/db'
import { intelligenceVerdicts, recommendationRunSteps, recommendations } from '@/db/schema'
import { autoArchiveImpl } from '@/lib/cron/auto-archive'
import { birthdayEmailsImpl } from '@/lib/cron/birthday-emails'
import { cleanupVerificationImpl } from '@/lib/cron/cleanup-verification'
import { listOwnerRemindersImpl } from '@/lib/cron/list-owner-reminders'
import { orphanClaimCleanupImpl } from '@/lib/cron/orphan-claim-cleanup'
import { sweepCronRuns } from '@/lib/cron/record-run'
import type { CronEndpoint } from '@/lib/cron/registry'
import { relationshipRemindersImpl } from '@/lib/cron/relationship-reminders'
import { sendRevealEmails } from '@/lib/cron/reveal-emails'
import { processOnce } from '@/lib/import/scrape-queue/runner'
import { maybeSendOperatorDigest } from '@/lib/intelligence/operator-digest'
import { selectOverdueUsers } from '@/lib/intelligence/overdue'
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

// Memoized model judgments (duplicate-pair / grouping-list verdicts)
// are pruned on a fixed window: long enough that steady-state runs almost
// always hit, short enough that a wrong negative verdict eventually
// re-judges even if the titles never change.
const VERDICT_RETENTION_DAYS = 90

async function runIntelligenceRetentionSweep(args: { recDays: number; stepDays: number }) {
	const recCutoff = new Date(Date.now() - args.recDays * 86400000)
	const stepCutoff = new Date(Date.now() - args.stepDays * 86400000)
	const verdictCutoff = new Date(Date.now() - VERDICT_RETENTION_DAYS * 86400000)
	const recRows = await db.delete(recommendations).where(lt(recommendations.createdAt, recCutoff)).returning({ id: recommendations.id })
	const stepRows = await db
		.delete(recommendationRunSteps)
		.where(lt(recommendationRunSteps.createdAt, stepCutoff))
		.returning({ id: recommendationRunSteps.id })
	const verdictRows = await db
		.delete(intelligenceVerdicts)
		.where(lt(intelligenceVerdicts.createdAt, verdictCutoff))
		.returning({ key: intelligenceVerdicts.key })
	return { recsDeleted: recRows.length, stepsDeleted: stepRows.length, verdictsDeleted: verdictRows.length }
}

export async function runAutoArchive() {
	const started = Date.now()
	const settings = await getAppSettings(db)
	const now = new Date()

	const {
		birthdayArchived,
		birthdayAddonsArchived,
		christmasArchived,
		christmasAddonsArchived,
		holidayArchived,
		holidayAddonsArchived,
		deferredArchived,
		deferredAddonsArchived,
		revealed,
	} = await autoArchiveImpl({
		db,
		now,
		archiveDaysAfterBirthday: settings.archiveDaysAfterBirthday,
		archiveDaysAfterChristmas: settings.archiveDaysAfterChristmas,
		archiveDaysAfterHoliday: settings.archiveDaysAfterHoliday,
		timeZone: settings.timeZone,
	})

	// The reveal email: one per owner, listing exactly what this run revealed
	// across all four passes. Each list's section is gated by its own per-type
	// toggle inside `sendRevealEmails`; a send failure never blocks the
	// archive, which has already happened.
	let revealEmailsSent = 0
	try {
		revealEmailsSent = await sendRevealEmails(db, revealed, settings)
	} catch (err) {
		log.warn({ err: err instanceof Error ? err.message : String(err) }, 'reveal email batch failed')
	}

	const durationMs = Date.now() - started
	log.info(
		{
			endpoint: '/api/cron/auto-archive',
			birthdayArchived,
			birthdayAddonsArchived,
			christmasArchived,
			christmasAddonsArchived,
			holidayArchived,
			holidayAddonsArchived,
			deferredArchived,
			deferredAddonsArchived,
			revealEmailsSent,
			durationMs,
		},
		'cron run complete'
	)

	return {
		ok: true,
		birthdayArchived,
		birthdayAddonsArchived,
		christmasArchived,
		christmasAddonsArchived,
		holidayArchived,
		holidayAddonsArchived,
		deferredArchived,
		deferredAddonsArchived,
		revealEmailsSent,
		settings: {
			archiveDaysAfterBirthday: settings.archiveDaysAfterBirthday,
			archiveDaysAfterChristmas: settings.archiveDaysAfterChristmas,
			archiveDaysAfterHoliday: settings.archiveDaysAfterHoliday,
		},
		date: now.toISOString(),
	}
}

export async function runBirthdayEmails(): Promise<Record<string, {}>> {
	const started = Date.now()
	const now = new Date()
	const emailConfigured = await isEmailConfigured()
	const settings = await getAppSettings(db)

	// Orphan-claim cleanup runs regardless of email config: pass 2 (the
	// hard-delete on event day) is a data lifecycle operation, not a
	// notification. Pass 1 (the day-before reminder) is gated on email
	// config inside the impl.
	let orphanClaimCleanup: { remindersSent: number; itemsDeleted: number; claimsDeleted: number } = {
		remindersSent: 0,
		itemsDeleted: 0,
		claimsDeleted: 0,
	}
	try {
		orphanClaimCleanup = await orphanClaimCleanupImpl({ db, now, timeZone: settings.timeZone })
	} catch (err) {
		log.warn({ err: err instanceof Error ? err.message : String(err) }, 'orphan-claim-cleanup batch failed')
	}

	if (!emailConfigured) {
		const totalOrphan = orphanClaimCleanup.remindersSent + orphanClaimCleanup.itemsDeleted
		if (totalOrphan === 0) return { ok: true, skipped: 'email-not-configured', date: now.toISOString() }
		return { ok: true, skipped: 'email-not-configured', orphanClaimCleanup, date: now.toISOString() }
	}

	let birthdayEmails = 0

	// The cron's name is "birthday-emails" but we use it as the daily
	// outbound-mail tick: the day-of birthday greeting from `enableBirthdayEmails`,
	// the broadcast pre-event list-owner reminders, and the four-family
	// relationship reminders. Each branch is feature-gated independently.
	if (settings.enableBirthdayEmails) {
		const result = await birthdayEmailsImpl({ db, now, timeZone: settings.timeZone })
		birthdayEmails = result.birthdayEmails
	}

	let listOwnerReminders: { birthdayReminders: number; christmasReminders: number; customHolidayReminders: number } = {
		birthdayReminders: 0,
		christmasReminders: 0,
		customHolidayReminders: 0,
	}
	try {
		listOwnerReminders = await listOwnerRemindersImpl({ db, now, settings })
	} catch (err) {
		log.warn({ err: err instanceof Error ? err.message : String(err) }, 'list-owner-reminders batch failed')
	}

	let relationshipReminders: {
		mothersDayReminders: number
		fathersDayReminders: number
		valentinesDayReminders: number
		anniversaryReminders: number
	} = { mothersDayReminders: 0, fathersDayReminders: 0, valentinesDayReminders: 0, anniversaryReminders: 0 }
	try {
		relationshipReminders = await relationshipRemindersImpl({ db, now, settings })
	} catch (err) {
		log.warn({ err: err instanceof Error ? err.message : String(err) }, 'relationship-reminders batch failed')
	}

	const durationMs = Date.now() - started
	log.info(
		{
			endpoint: '/api/cron/birthday-emails',
			birthdayEmails,
			listOwnerReminders,
			relationshipReminders,
			orphanClaimCleanup,
			durationMs,
		},
		'cron run complete'
	)

	const totalListOwner =
		listOwnerReminders.birthdayReminders + listOwnerReminders.christmasReminders + listOwnerReminders.customHolidayReminders
	const totalRelationship =
		relationshipReminders.mothersDayReminders +
		relationshipReminders.fathersDayReminders +
		relationshipReminders.valentinesDayReminders +
		relationshipReminders.anniversaryReminders
	const totalOrphan = orphanClaimCleanup.remindersSent + orphanClaimCleanup.itemsDeleted

	if (birthdayEmails === 0 && totalListOwner === 0 && totalRelationship === 0 && totalOrphan === 0 && !settings.enableBirthdayEmails) {
		return { ok: true, skipped: 'disabled', date: now.toISOString() }
	}

	return {
		ok: true,
		birthdayEmails,
		listOwnerReminders,
		relationshipReminders,
		orphanClaimCleanup,
		date: now.toISOString(),
	}
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

export async function runIntelligenceRecommendations(): Promise<Record<string, {}>> {
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

	// Operator Digest post-step. Placed before the retention sweep so a sweep
	// failure can't starve it, and wrapped so a digest failure never flips this
	// run to error (it's a side-channel). Self-guards on the refresh interval,
	// so most daily ticks no-op here. See operator-digest.ts.
	let digest: Awaited<ReturnType<typeof maybeSendOperatorDigest>> = { sent: false, reason: 'not-attempted' }
	try {
		digest = await maybeSendOperatorDigest(settings, db)
	} catch (err) {
		log.warn({ err: err instanceof Error ? err.message : String(err) }, 'operator digest send failed')
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
		digest,
		durationMs: Date.now() - started,
	}
	log.info({ endpoint: '/api/cron/intelligence-recommendations', ...summary }, 'cron run complete')
	return summary
}

export async function runItemScrapeQueue(): Promise<Record<string, {}>> {
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

// `Record<string, {}>` (non-null values) is the shape tanstack-start's
// serializer requires for the `runCronAsAdmin` return type. Each handler
// declares this return type explicitly so the discriminated unions across
// early-skip vs main-result branches don't generate `?: undefined` keys
// that fail the constraint.
export const cronHandlers: Record<CronEndpoint, () => Promise<Record<string, {}>>> = {
	'/api/cron/auto-archive': runAutoArchive,
	'/api/cron/birthday-emails': runBirthdayEmails,
	'/api/cron/cleanup-verification': runCleanupVerification,
	'/api/cron/intelligence-recommendations': runIntelligenceRecommendations,
	'/api/cron/item-scrape-queue': runItemScrapeQueue,
}
