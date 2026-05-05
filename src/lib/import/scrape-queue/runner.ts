// Scrape-queue runner: drains pending `itemScrapeJobs` rows for a single
// user (or, in the cron tick, distinct users with ready jobs). Mirrors
// the shape of `src/lib/intelligence/runner.ts`:
//
//   - Per-user `pg_try_advisory_lock` keyed by
//     `itemScrapeQueueLockKeySql(userId)` so concurrent triggers
//     (cron + a manual run-once + a long-lived worker) cannot
//     double-spend on the same user.
//   - Configurable concurrency (`scrapeQueueConcurrency`) sets both the
//     batch size pulled per tick AND the parallelism inside the tick.
//     Lower bound is 1; the pull uses `LIMIT n` so a single hot user
//     can't starve the rest of the batch.
//   - On failure: exponential backoff (`60 * 2^attempts`, capped at one
//     hour) until `scrapeQueueMaxAttempts`, then `failed`.
//   - After every job mutation, publish to the per-list SSE channel so
//     the edit page refreshes the affected item without a full reload.
//
// Public surface:
//   - `processForUser(db, userId, opts)` - the per-user entry point.
//     Used by the cron tick, manual triggers, the run-once CLI, and the
//     long-lived worker pattern.
//   - `processOnce(db, opts)` - the cron tick. Picks distinct user ids
//     with pending+ready jobs (limit `usersPerInvocation`) and runs
//     `processForUser` for each sequentially.
//   - `enqueueScrapeJob(db, args)` - idempotent enqueue. No-ops if a
//     `pending` row already exists for the same `itemId`.

import { and, desc, eq, inArray, lte, sql } from 'drizzle-orm'

import type { Database, SchemaDatabase } from '@/db'
import { items, itemScrapeJobs, itemScrapeQueueLockKeySql, type NewItemScrapeJob } from '@/db/schema'
import { httpsUpgradeOrNull } from '@/lib/image-url'
import { createLogger } from '@/lib/logger'
import { runOneShotScrape } from '@/lib/scrapers/run'
import type { OrchestrateResult, ScrapeResult } from '@/lib/scrapers/types'
import { type AppSettings, DEFAULT_APP_SETTINGS } from '@/lib/settings'
import { getAppSettings } from '@/lib/settings-loader'
import { mirrorRemoteImageToStorage } from '@/lib/storage/mirror'
import { getVendorFromUrl } from '@/lib/urls'
import { notifyListChange } from '@/routes/api/sse/list.$listId'

const log = createLogger('scrape-queue-runner')

export type ProcessTrigger = 'cron' | 'manual'

export type ProcessForUserResult =
	| { status: 'success'; processed: number; succeeded: number; failed: number; retriable: number }
	| { status: 'skipped'; reason: 'disabled' | 'lock-held' | 'no-jobs' }
	| { status: 'error'; error: string }

export type ProcessForUserOptions = {
	trigger: ProcessTrigger
}

// ---------------------------------------------------------------------------
// Backoff
// ---------------------------------------------------------------------------

// Public for unit tests. Returns the delay in seconds for the
// `attempts`-th failure (1-indexed, since the row's attempt counter is
// incremented before this is consulted).
export function backoffSecondsForAttempts(attempts: number): number {
	const base = 60 * 2 ** Math.max(0, attempts - 1)
	return Math.min(base, 3600)
}

// ---------------------------------------------------------------------------
// Idempotent enqueue
// ---------------------------------------------------------------------------

export type EnqueueScrapeJobArgs = {
	itemId: number
	userId: string
	url: string
}

export type EnqueueScrapeJobResult = { kind: 'enqueued'; jobId: number } | { kind: 'already-pending'; jobId: number }

// Insert a new pending job for `itemId` unless a pending row already
// exists. Returns the id of the row that ended up live so callers can log
// or surface progress.
export async function enqueueScrapeJob(db: SchemaDatabase, args: EnqueueScrapeJobArgs): Promise<EnqueueScrapeJobResult> {
	const existing = await db
		.select({ id: itemScrapeJobs.id })
		.from(itemScrapeJobs)
		.where(and(eq(itemScrapeJobs.itemId, args.itemId), eq(itemScrapeJobs.status, 'pending')))
		.limit(1)
	if (existing.length > 0) {
		return { kind: 'already-pending', jobId: existing[0].id }
	}
	const [row] = await db
		.insert(itemScrapeJobs)
		.values({
			itemId: args.itemId,
			userId: args.userId,
			url: args.url,
		} satisfies NewItemScrapeJob)
		.returning({ id: itemScrapeJobs.id })
	return { kind: 'enqueued', jobId: row.id }
}

// ---------------------------------------------------------------------------
// Cron tick: pick distinct users, drain each
// ---------------------------------------------------------------------------

export type ProcessOnceOptions = {
	usersPerInvocation: number
	trigger?: ProcessTrigger
}

export type ProcessOnceResult = {
	usersProcessed: number
	skippedLocked: number
	skippedDisabled: number
	skippedNoJobs: number
	totalSucceeded: number
	totalFailed: number
	totalRetriable: number
	errors: number
}

export async function processOnce(db: Database, opts: ProcessOnceOptions): Promise<ProcessOnceResult> {
	const trigger = opts.trigger ?? 'cron'
	const userRows = await db
		.selectDistinct({ userId: itemScrapeJobs.userId })
		.from(itemScrapeJobs)
		.where(and(eq(itemScrapeJobs.status, 'pending'), lte(itemScrapeJobs.nextAttemptAt, new Date())))
		.limit(opts.usersPerInvocation)

	const userIds = userRows.map(r => r.userId).filter((v): v is string => v !== null)

	const summary: ProcessOnceResult = {
		usersProcessed: 0,
		skippedLocked: 0,
		skippedDisabled: 0,
		skippedNoJobs: 0,
		totalSucceeded: 0,
		totalFailed: 0,
		totalRetriable: 0,
		errors: 0,
	}

	for (const userId of userIds) {
		try {
			const r = await processForUser(db, userId, { trigger })
			if (r.status === 'success') {
				summary.usersProcessed++
				summary.totalSucceeded += r.succeeded
				summary.totalFailed += r.failed
				summary.totalRetriable += r.retriable
			} else if (r.status === 'skipped') {
				if (r.reason === 'lock-held') summary.skippedLocked++
				else if (r.reason === 'disabled') summary.skippedDisabled++
				else summary.skippedNoJobs++
			} else {
				summary.errors++
			}
		} catch (err) {
			summary.errors++
			log.error({ userId, err: err instanceof Error ? err.message : String(err) }, 'unexpected error processing user')
		}
	}

	return summary
}

// ---------------------------------------------------------------------------
// Per-user drain
// ---------------------------------------------------------------------------

export async function processForUser(db: Database, userId: string, opts: ProcessForUserOptions): Promise<ProcessForUserResult> {
	const settings = await loadSettings(db)
	if (!settings.importEnabled) {
		return { status: 'skipped', reason: 'disabled' }
	}

	const lockKey = itemScrapeQueueLockKeySql(userId)
	const lockRes = await db.execute<{ acquired: boolean }>(sql`select pg_try_advisory_lock(${lockKey}) as acquired`)
	const acquired = lockRes.rows[0]?.acquired === true
	if (!acquired) {
		return { status: 'skipped', reason: 'lock-held' }
	}

	try {
		// Pull a batch of ready jobs. `FOR UPDATE SKIP LOCKED` guards
		// against the (theoretical) case where another transaction grabs
		// the row in between this select and the status update; combined
		// with the per-user advisory lock above it's belt-and-braces.
		const claimed = await db
			.execute<{ id: number; item_id: number; user_id: string | null; url: string; attempts: number }>(
				sql`
				select id, item_id, user_id, url, attempts
				from ${itemScrapeJobs}
				where status = 'pending'
					and ${itemScrapeJobs.userId} = ${userId}
					and next_attempt_at <= now()
				order by next_attempt_at asc
				limit ${settings.scrapeQueueConcurrency}
				for update skip locked
			`
			)
			.then(res => res.rows)

		if (claimed.length === 0) {
			return { status: 'skipped', reason: 'no-jobs' }
		}

		const claimedIds = claimed.map(r => r.id)
		await db.update(itemScrapeJobs).set({ status: 'running' }).where(inArray(itemScrapeJobs.id, claimedIds))

		log.info({ userId, count: claimed.length, trigger: opts.trigger }, 'processing scrape-queue batch')

		const outcomes = await Promise.allSettled(
			claimed.map(job =>
				processJob(db, settings, {
					id: job.id,
					itemId: job.item_id,
					userId: job.user_id,
					url: job.url,
					attempts: job.attempts,
				})
			)
		)

		let succeeded = 0
		let failed = 0
		let retriable = 0
		for (const outcome of outcomes) {
			if (outcome.status === 'fulfilled') {
				if (outcome.value === 'success') succeeded++
				else if (outcome.value === 'failed') failed++
				else retriable++
			} else {
				// processJob already converts errors into a `retriable`
				// outcome via try/catch, so this path is for genuinely
				// unexpected throws (DB connection blip, etc).
				retriable++
				log.error({ err: outcome.reason }, 'unexpected throw inside processJob')
			}
		}

		return {
			status: 'success',
			processed: claimed.length,
			succeeded,
			failed,
			retriable,
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err)
		log.error({ userId, err: msg }, 'processForUser failed')
		return { status: 'error', error: msg }
	} finally {
		await db.execute(sql`select pg_advisory_unlock(${lockKey})`)
	}
}

// ---------------------------------------------------------------------------
// Per-job mutation
// ---------------------------------------------------------------------------

type ClaimedJob = {
	id: number
	itemId: number
	userId: string | null
	url: string
	attempts: number
}

type JobOutcome = 'success' | 'failed' | 'retriable'

async function processJob(db: Database, settings: AppSettings, job: ClaimedJob): Promise<JobOutcome> {
	const userIdForScrape = job.userId ?? 'system'
	let result: OrchestrateResult
	try {
		result = await runOneShotScrape({ url: job.url, userId: userIdForScrape, itemId: job.itemId })
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err)
		return await markFailure(db, settings, job, msg)
	}

	if (result.kind !== 'ok') {
		return await markFailure(db, settings, job, `scrape error: ${result.reason}`)
	}

	try {
		await mergeScrapeIntoItem(db, job.itemId, job.url, result.result)
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err)
		return await markFailure(db, settings, job, msg)
	}

	await db.update(itemScrapeJobs).set({ status: 'success', completedAt: new Date(), lastError: null }).where(eq(itemScrapeJobs.id, job.id))

	await notifyListForItem(db, job.itemId)

	return 'success'
}

async function markFailure(db: Database, settings: AppSettings, job: ClaimedJob, errorMessage: string): Promise<JobOutcome> {
	const newAttempts = job.attempts + 1
	if (newAttempts >= settings.scrapeQueueMaxAttempts) {
		await db
			.update(itemScrapeJobs)
			.set({
				status: 'failed',
				attempts: newAttempts,
				lastError: errorMessage,
				completedAt: new Date(),
			})
			.where(eq(itemScrapeJobs.id, job.id))
		await notifyListForItem(db, job.itemId)
		return 'failed'
	}

	const backoffSecs = backoffSecondsForAttempts(newAttempts)
	const nextAttemptAt = new Date(Date.now() + backoffSecs * 1000)
	await db
		.update(itemScrapeJobs)
		.set({
			status: 'pending',
			attempts: newAttempts,
			lastError: errorMessage,
			nextAttemptAt,
		})
		.where(eq(itemScrapeJobs.id, job.id))
	return 'retriable'
}

// ---------------------------------------------------------------------------
// Field merge
// ---------------------------------------------------------------------------

// Fill-empty-only merge. Mirrors the spirit of `applyScrapePrefill` in
// `src/lib/scrapers/apply-prefill.ts`: anything the user already typed in
// the preview step wins. The runner runs after a row is in the DB, so
// "user-set" means "non-null and non-empty for strings, > 1 for quantity"
// kept loose; we only touch fields that are still blank.
export async function mergeScrapeIntoItem(db: SchemaDatabase, itemId: number, scrapeUrl: string, result: ScrapeResult): Promise<void> {
	const existing = await db.query.items.findFirst({
		where: eq(items.id, itemId),
		columns: {
			id: true,
			title: true,
			price: true,
			currency: true,
			imageUrl: true,
			notes: true,
			vendorId: true,
			vendorSource: true,
			url: true,
		},
	})
	if (!existing) return

	const updates: Record<string, unknown> = {}

	if (isBlankTitleSubstitute(existing.title, scrapeUrl) && result.title && result.title.trim().length > 0) {
		updates.title = result.title.trim()
	}
	if (!existing.price && result.price) {
		updates.price = result.price
	}
	if (!existing.currency && result.currency) {
		updates.currency = result.currency
	}
	if (!existing.notes && result.description) {
		updates.notes = result.description
	}
	const candidate = result.imageUrls[0]
	if (!existing.imageUrl && candidate) {
		updates.imageUrl = httpsUpgradeOrNull(candidate)
	}
	// Ratings are not user-controllable, so a re-scrape that surfaces a
	// rating always wins. We don't clear an existing rating when the
	// new scrape returns nothing - provider variance shouldn't drop
	// good signal we already have.
	if (typeof result.ratingValue === 'number') {
		updates.ratingValue = result.ratingValue
	}
	if (typeof result.ratingCount === 'number') {
		updates.ratingCount = result.ratingCount
	}
	// Vendor: if URL is set and vendor still missing (no rule match at
	// create-time, e.g. a redirect target only known post-scrape), try
	// to derive from the scrape's `finalUrl` as a fallback. Don't
	// override when the source is `manual`.
	if ((!existing.vendorId || existing.vendorSource === null) && result.finalUrl && existing.vendorSource !== 'manual') {
		const vendor = getVendorFromUrl(result.finalUrl)
		if (vendor) {
			updates.vendorId = vendor.id
			updates.vendorSource = 'rule'
		}
	}

	if (Object.keys(updates).length === 0) return

	await db.update(items).set(updates).where(eq(items.id, itemId))

	// Best-effort image mirror, gated on settings. Matches the inline
	// scrape behavior so a queued scrape doesn't leave the row pointing
	// at an external URL the inline path would have mirrored.
	if (typeof updates.imageUrl === 'string') {
		try {
			const settings = await getAppSettings(db)
			if (settings.mirrorExternalImagesOnSave) {
				const mirrored = await mirrorRemoteImageToStorage(updates.imageUrl, itemId)
				if (mirrored && mirrored !== updates.imageUrl) {
					await db.update(items).set({ imageUrl: mirrored }).where(eq(items.id, itemId))
				}
			}
		} catch (err) {
			log.warn({ itemId, err: err instanceof Error ? err.message : String(err) }, 'image mirror failed; keeping external URL')
		}
	}
}

// Treats the bulk-create placeholder titles ("untitled" / hostname /
// empty) as "blank" so the scrape can fill them in, while leaving any
// user-typed title alone.
function isBlankTitleSubstitute(title: string, url: string): boolean {
	if (!title || !title.trim()) return true
	const trimmed = title.trim()
	if (trimmed.toLowerCase() === 'untitled') return true
	try {
		const host = new URL(url).hostname.toLowerCase()
		if (trimmed.toLowerCase() === host) return true
		if (trimmed.toLowerCase() === host.replace(/^www\./, '')) return true
	} catch {
		// not a parseable URL; fall through
	}
	return false
}

// ---------------------------------------------------------------------------
// SSE notify helper
// ---------------------------------------------------------------------------

async function notifyListForItem(db: SchemaDatabase, itemId: number) {
	try {
		const row = await db.query.items.findFirst({ where: eq(items.id, itemId), columns: { listId: true } })
		if (row) notifyListChange(row.listId)
	} catch (err) {
		log.warn({ itemId, err: err instanceof Error ? err.message : String(err) }, 'sse notify failed')
	}
}

// ---------------------------------------------------------------------------
// Settings load
// ---------------------------------------------------------------------------

async function loadSettings(db: SchemaDatabase): Promise<AppSettings> {
	try {
		return await getAppSettings(db)
	} catch (err) {
		log.warn({ err: err instanceof Error ? err.message : String(err) }, 'failed to load settings; using defaults')
		return DEFAULT_APP_SETTINGS
	}
}

// Re-export the order-by symbol so call sites that want to debug-list
// jobs can mirror the runner's ordering. Cheap to expose; nothing here
// is privileged.
export const debugOrderByNextAttempt = desc(itemScrapeJobs.nextAttemptAt)
