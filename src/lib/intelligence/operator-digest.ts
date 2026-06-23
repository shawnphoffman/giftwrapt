// Intelligence Operator Digest.
//
// A periodic email to deployment admins summarizing system-wide
// Intelligence activity. v1 is operator-facing only (a per-user "User
// Digest" is a future followup). See .notes/architecture/intelligence.md
// → "Operator Digest (email)" for the design.
//
// Trigger: piggybacks on the intelligence cron — `maybeSendOperatorDigest`
// runs as a post-step of `runIntelligenceRecommendations` (no dedicated
// /api/cron/* endpoint), matching how every other email family hangs off a
// daily cron tick. The send is wrapped in try/catch by the caller so a
// digest failure never flips a healthy intelligence run to error.
//
// Cadence: self-guarded. The tick fires daily, but the digest only sends
// when `now - lastSentAt >= intelligenceRefreshIntervalDays`. Last-sent is
// stored as an internal `app_settings` row (`__intelligenceDigestLastSentAt`,
// not part of the typed settings schema), mirroring the
// `__lastChristmasReminderYear` idempotency flag.
//
// Content honesty: `recommendationRuns` is an append-only log, so health /
// coverage / cost are true window deltas. `recommendations` is a
// current-state snapshot (persistBatch DELETE+INSERTs per run) with no
// `appliedAt`, so output volume and applied-total are point-in-time
// snapshots, not "this period" deltas. The template labels each section
// accordingly.

import { and, count, eq, gte, inArray, lt, sql, sum } from 'drizzle-orm'

import { db, type SchemaDatabase } from '@/db'
import { appSettings, recommendationRuns, recommendations, users } from '@/db/schema'
import { isEmailConfigured, sendOperatorDigestEmail } from '@/lib/resend'
import type { AppSettings } from '@/lib/settings'

// Internal idempotency flag (not in the typed settings schema). Holds the
// ISO timestamp of the most recent successful operator-digest send.
const LAST_SENT_FLAG_KEY = '__intelligenceDigestLastSentAt'

// A user is "flagged" (named in the needs-attention section) when they had
// any errored run, or at least this many skipped runs, in the window.
const FLAGGED_SKIP_THRESHOLD = 2
// Cap on how many users the needs-attention section names.
const FLAGGED_USERS_LIMIT = 10

export type DigestFlaggedUser = {
	userId: string
	email: string
	name: string | null
	errors: number
	skips: number
}

export type OperatorDigestData = {
	// Window the deltas cover (ISO). end is "now" at build time.
	windowStart: string
	windowEnd: string
	// ── Window deltas (true, from the append-only run log) ──
	runs: { total: number; success: number; error: number; skipped: number }
	skipReasons: Array<{ reason: string; count: number }>
	avgDurationMs: number
	tokensIn: number
	tokensOut: number
	estimatedCostUsd: number
	usersProcessed: number
	dismissedInWindow: number
	// ── Snapshots (current state; not "this period") ──
	activeRecsTotal: number
	activeByAnalyzer: Array<{ analyzerId: string; count: number }>
	activeBySeverity: Array<{ severity: string; count: number }>
	appliedTotal: number
	// ── Needs attention ──
	flaggedUsers: Array<DigestFlaggedUser>
}

// Aggregate the digest for an explicit window. Pure read; reused by both the
// cron path and the test-send path.
export async function buildOperatorDigest(window: { start: Date; end: Date }, dbx: SchemaDatabase = db): Promise<OperatorDigestData> {
	const { start, end } = window
	const inWindow = and(gte(recommendationRuns.startedAt, start), lt(recommendationRuns.startedAt, end))

	// Health: counts by status + skipReason, token/cost rollup.
	const runRows = await dbx
		.select({
			status: recommendationRuns.status,
			skipReason: recommendationRuns.skipReason,
			n: count(),
			tokensIn: sum(recommendationRuns.tokensIn).mapWith(Number),
			tokensOut: sum(recommendationRuns.tokensOut).mapWith(Number),
			costMicro: sum(recommendationRuns.estimatedCostMicroUsd).mapWith(Number),
		})
		.from(recommendationRuns)
		.where(inWindow)
		.groupBy(recommendationRuns.status, recommendationRuns.skipReason)

	const runs = { total: 0, success: 0, error: 0, skipped: 0 }
	const skipReasonMap = new Map<string, number>()
	let tokensIn = 0
	let tokensOut = 0
	let costMicro = 0
	for (const r of runRows) {
		runs.total += r.n
		tokensIn += r.tokensIn
		tokensOut += r.tokensOut
		costMicro += r.costMicro
		if (r.status === 'success') runs.success += r.n
		else if (r.status === 'error') runs.error += r.n
		else if (r.status === 'skipped') {
			runs.skipped += r.n
			const reason = r.skipReason ?? 'unknown'
			skipReasonMap.set(reason, (skipReasonMap.get(reason) ?? 0) + r.n)
		}
	}

	// Coverage + avg duration (one row).
	const [coverage] = await dbx
		.select({
			usersProcessed: sql<number>`count(distinct ${recommendationRuns.userId})`.mapWith(Number),
			avgDurationMs:
				sql<number>`coalesce(avg(extract(epoch from (${recommendationRuns.finishedAt} - ${recommendationRuns.startedAt})) * 1000), 0)`.mapWith(
					Number
				),
		})
		.from(recommendationRuns)
		.where(inWindow)

	// Volume snapshot: current active recs by analyzer + severity.
	const activeByAnalyzerRows = await dbx
		.select({ analyzerId: recommendations.analyzerId, n: count() })
		.from(recommendations)
		.where(eq(recommendations.status, 'active'))
		.groupBy(recommendations.analyzerId)
	const activeBySeverityRows = await dbx
		.select({ severity: recommendations.severity, n: count() })
		.from(recommendations)
		.where(eq(recommendations.status, 'active'))
		.groupBy(recommendations.severity)

	// Engagement: dismissals in window (true delta) + applied total (snapshot).
	const [dismissed] = await dbx
		.select({ n: count() })
		.from(recommendations)
		.where(and(gte(recommendations.dismissedAt, start), lt(recommendations.dismissedAt, end)))
	const [applied] = await dbx.select({ n: count() }).from(recommendations).where(eq(recommendations.status, 'applied'))

	// Needs-attention: users with errors or repeated skips in the window.
	const perUser = await dbx
		.select({
			userId: recommendationRuns.userId,
			errors: sql<number>`count(*) filter (where ${recommendationRuns.status} = 'error')`.mapWith(Number),
			skips: sql<number>`count(*) filter (where ${recommendationRuns.status} = 'skipped')`.mapWith(Number),
		})
		.from(recommendationRuns)
		.where(inWindow)
		.groupBy(recommendationRuns.userId)

	const flagged = perUser
		.filter(u => u.errors > 0 || u.skips >= FLAGGED_SKIP_THRESHOLD)
		.sort((a, b) => b.errors - a.errors || b.skips - a.skips)
		.slice(0, FLAGGED_USERS_LIMIT)

	const flaggedUsers: Array<DigestFlaggedUser> = []
	if (flagged.length > 0) {
		const ids = flagged.map(f => f.userId)
		const userRows = await dbx.select({ id: users.id, email: users.email, name: users.name }).from(users).where(inArray(users.id, ids))
		const userMap = new Map(userRows.map(u => [u.id, u]))
		for (const f of flagged) {
			const u = userMap.get(f.userId)
			if (!u) continue
			flaggedUsers.push({ userId: f.userId, email: u.email, name: u.name, errors: f.errors, skips: f.skips })
		}
	}

	return {
		windowStart: start.toISOString(),
		windowEnd: end.toISOString(),
		runs,
		skipReasons: [...skipReasonMap.entries()].map(([reason, c]) => ({ reason, count: c })).sort((a, b) => b.count - a.count),
		avgDurationMs: Math.round(coverage.avgDurationMs),
		tokensIn,
		tokensOut,
		estimatedCostUsd: costMicro / 1_000_000,
		usersProcessed: coverage.usersProcessed,
		dismissedInWindow: dismissed.n,
		activeRecsTotal: activeByAnalyzerRows.reduce((acc, r) => acc + r.n, 0),
		activeByAnalyzer: activeByAnalyzerRows.map(r => ({ analyzerId: r.analyzerId, count: r.n })).sort((a, b) => b.count - a.count),
		activeBySeverity: activeBySeverityRows.map(r => ({ severity: r.severity, count: r.n })),
		appliedTotal: applied.n,
		flaggedUsers,
	}
}

// One-line human status used in the subject + a header line.
export function operatorDigestStatus(data: OperatorDigestData): { tone: 'error' | 'quiet' | 'ok'; label: string } {
	if (data.runs.error > 0) {
		return { tone: 'error', label: `${data.runs.error} error${data.runs.error === 1 ? '' : 's'} need attention` }
	}
	if (data.runs.total === 0) return { tone: 'quiet', label: 'no runs this period' }
	return { tone: 'ok', label: 'all clear' }
}

export function operatorDigestSubject(data: OperatorDigestData): string {
	return `Intelligence digest — ${operatorDigestStatus(data).label}`
}

// Compute the window for a scheduled send: since the last successful send,
// falling back to a trailing interval on the first send or after a gap.
export function digestWindow(lastSentAt: Date | null, intervalDays: number, now: Date): { start: Date; end: Date } {
	const trailingStart = new Date(now.getTime() - intervalDays * 86_400_000)
	return { start: lastSentAt ?? trailingStart, end: now }
}

async function readLastSentAt(dbx: SchemaDatabase): Promise<Date | null> {
	const rows = await dbx.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, LAST_SENT_FLAG_KEY)).limit(1)
	const raw = rows[0]?.value
	if (typeof raw !== 'string') return null
	const d = new Date(raw)
	return Number.isNaN(d.getTime()) ? null : d
}

async function writeLastSentAt(dbx: SchemaDatabase, at: Date): Promise<void> {
	await dbx
		.insert(appSettings)
		.values({ key: LAST_SENT_FLAG_KEY, value: at.toISOString() })
		.onConflictDoUpdate({ target: appSettings.key, set: { value: at.toISOString() } })
}

export type DigestSendOutcome = { sent: boolean; reason?: string; recipients?: number }

// Cron post-step. Gate → interval guard → window → build → send → stamp.
// Always sends a heartbeat when gated-on and the interval has elapsed (even
// an all-quiet period), so absence of email is a signal. `now` is injectable
// for tests.
export async function maybeSendOperatorDigest(
	settings: AppSettings,
	dbx: SchemaDatabase = db,
	now: Date = new Date()
): Promise<DigestSendOutcome> {
	if (!settings.intelligenceEnabled) return { sent: false, reason: 'disabled' }
	if (!settings.intelligenceEmailEnabled || !settings.intelligenceEmailWeeklyDigestEnabled) return { sent: false, reason: 'toggle-off' }
	if (!(await isEmailConfigured(dbx))) return { sent: false, reason: 'email-not-configured' }

	const intervalDays = settings.intelligenceRefreshIntervalDays
	const lastSentAt = await readLastSentAt(dbx)
	if (lastSentAt && now.getTime() - lastSentAt.getTime() < intervalDays * 86_400_000) {
		return { sent: false, reason: 'too-soon' }
	}

	// Recipient resolution: Test Recipient override → only there; otherwise all
	// admins (BCC'd by the send fn so addresses aren't exposed to each other).
	let recipients: Array<string>
	if (settings.intelligenceEmailTestRecipient) {
		recipients = [settings.intelligenceEmailTestRecipient]
	} else {
		const adminRows = await dbx.select({ email: users.email }).from(users).where(eq(users.role, 'admin'))
		recipients = adminRows.map(r => r.email).filter(Boolean)
	}
	if (recipients.length === 0) return { sent: false, reason: 'no-recipients' }

	const data = await buildOperatorDigest(digestWindow(lastSentAt, intervalDays, now), dbx)
	await sendOperatorDigestEmail(recipients, data, operatorDigestSubject(data))
	await writeLastSentAt(dbx, now)
	return { sent: true, recipients: recipients.length }
}
