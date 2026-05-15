import { createServerFn } from '@tanstack/react-start'
import { and, asc, avg, count, desc, eq, gte, inArray, sql, sum } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { recommendationRuns, recommendationRunSteps, recommendations, users } from '@/db/schema'
import { resolveAiConfig } from '@/lib/ai-config'
import { ANALYZERS, getAnalyzer } from '@/lib/intelligence/registry'
import { generateForUser } from '@/lib/intelligence/runner'
import { loggingMiddleware } from '@/lib/logger'
import { getAppSettings } from '@/lib/settings-loader'
import { adminAuthMiddleware } from '@/middleware/auth'

// ─── Helpers ────────────────────────────────────────────────────────────────

type AnalyzerStat = {
	id: string
	label: string
	enabled: boolean
	avgDurationMs: number
	avgTokensIn: number
	avgTokensOut: number
	activeRecs: number
}

async function loadAnalyzerStats(perAnalyzerEnabled: Record<string, boolean>): Promise<Array<AnalyzerStat>> {
	const sevenDaysAgo = new Date(Date.now() - 7 * 86400000)
	const stepRows = await db
		.select({
			analyzer: recommendationRunSteps.analyzer,
			avgLatency: avg(recommendationRunSteps.latencyMs).mapWith(Number),
			totalIn: sum(recommendationRunSteps.tokensIn).mapWith(Number),
			totalOut: sum(recommendationRunSteps.tokensOut).mapWith(Number),
			n: count(),
		})
		.from(recommendationRunSteps)
		.where(gte(recommendationRunSteps.createdAt, sevenDaysAgo))
		.groupBy(recommendationRunSteps.analyzer)

	const recCounts = await db
		.select({ analyzerId: recommendations.analyzerId, n: count() })
		.from(recommendations)
		.where(eq(recommendations.status, 'active'))
		.groupBy(recommendations.analyzerId)

	const statsMap = new Map(stepRows.map(r => [r.analyzer, r]))
	const recsMap = new Map(recCounts.map(r => [r.analyzerId, r.n]))

	return ANALYZERS.map(a => {
		const s = statsMap.get(a.id)
		return {
			id: a.id,
			label: a.label,
			enabled: Object.hasOwn(perAnalyzerEnabled, a.id) ? perAnalyzerEnabled[a.id] : a.enabledByDefault,
			avgDurationMs: s?.avgLatency ? Math.round(s.avgLatency) : 0,
			avgTokensIn: s?.n ? Math.round(s.totalIn / s.n) : 0,
			avgTokensOut: s?.n ? Math.round(s.totalOut / s.n) : 0,
			activeRecs: recsMap.get(a.id) ?? 0,
		}
	})
}

type StatusBucket = { success: number; skipped: Record<string, number>; error: number }

async function loadStatusBucket(sinceHours: number): Promise<StatusBucket> {
	const since = new Date(Date.now() - sinceHours * 3600 * 1000)
	const rows = await db
		.select({
			status: recommendationRuns.status,
			skipReason: recommendationRuns.skipReason,
			n: count(),
		})
		.from(recommendationRuns)
		.where(gte(recommendationRuns.startedAt, since))
		.groupBy(recommendationRuns.status, recommendationRuns.skipReason)

	const out: StatusBucket = { success: 0, skipped: {}, error: 0 }
	for (const r of rows) {
		if (r.status === 'success') out.success += r.n
		else if (r.status === 'error') out.error += r.n
		else if (r.status === 'skipped') {
			const key = r.skipReason ?? 'unknown'
			out.skipped[key] = (out.skipped[key] ?? 0) + r.n
		}
	}
	return out
}

async function loadDailySeries(): Promise<
	Array<{
		date: string
		runsSuccess: number
		runsSkipped: number
		runsError: number
		tokensIn: number
		tokensOut: number
		costUsd: number
		activeRecs: number
		dismissedRecs: number
		appliedRecs: number
	}>
> {
	const fromDate = new Date(Date.now() - 13 * 86400000)
	const [runsByDay, recsByDay] = await Promise.all([
		db
			.select({
				date: sql<string>`to_char(${recommendationRuns.startedAt}::date, 'YYYY-MM-DD')`,
				status: recommendationRuns.status,
				tokensIn: sum(recommendationRuns.tokensIn).mapWith(Number),
				tokensOut: sum(recommendationRuns.tokensOut).mapWith(Number),
				cost: sum(recommendationRuns.estimatedCostMicroUsd).mapWith(Number),
				n: count(),
			})
			.from(recommendationRuns)
			.where(gte(recommendationRuns.startedAt, fromDate))
			.groupBy(sql`${recommendationRuns.startedAt}::date`, recommendationRuns.status)
			.orderBy(sql`${recommendationRuns.startedAt}::date asc`),
		// Recs created per day + dismissed per day. createdAt drives the
		// "active recs" arrival rate; dismissedAt (when set) drives the
		// dismissed-per-day count. `applied` recs are inferred from the
		// status column on the same row, keyed off updatedAt-ish (we use
		// createdAt since there's no separate appliedAt timestamp; this
		// is good enough for a rolling chart).
		db
			.select({
				date: sql<string>`to_char(${recommendations.createdAt}::date, 'YYYY-MM-DD')`,
				status: recommendations.status,
				n: count(),
			})
			.from(recommendations)
			.where(gte(recommendations.createdAt, fromDate))
			.groupBy(sql`${recommendations.createdAt}::date`, recommendations.status),
	])

	type Bucket = {
		runsSuccess: number
		runsSkipped: number
		runsError: number
		tokensIn: number
		tokensOut: number
		costMicro: number
		activeRecs: number
		dismissedRecs: number
		appliedRecs: number
	}
	const empty: Bucket = {
		runsSuccess: 0,
		runsSkipped: 0,
		runsError: 0,
		tokensIn: 0,
		tokensOut: 0,
		costMicro: 0,
		activeRecs: 0,
		dismissedRecs: 0,
		appliedRecs: 0,
	}
	const map = new Map<string, Bucket>()
	for (const r of runsByDay) {
		const cur = map.get(r.date) ?? { ...empty }
		if (r.status === 'success') cur.runsSuccess += r.n
		else if (r.status === 'error') cur.runsError += r.n
		else cur.runsSkipped += r.n
		cur.tokensIn += r.tokensIn
		cur.tokensOut += r.tokensOut
		cur.costMicro += r.cost
		map.set(r.date, cur)
	}
	for (const r of recsByDay) {
		const cur = map.get(r.date) ?? { ...empty }
		if (r.status === 'active') cur.activeRecs += r.n
		else if (r.status === 'dismissed') cur.dismissedRecs += r.n
		else cur.appliedRecs += r.n // status === 'applied' (only remaining enum value)
		map.set(r.date, cur)
	}

	const out = []
	for (let i = 13; i >= 0; i--) {
		const d = new Date()
		d.setDate(d.getDate() - i)
		const key = d.toISOString().slice(0, 10)
		const v = map.get(key) ?? empty
		out.push({
			date: key,
			runsSuccess: v.runsSuccess,
			runsSkipped: v.runsSkipped,
			runsError: v.runsError,
			tokensIn: v.tokensIn,
			tokensOut: v.tokensOut,
			costUsd: v.costMicro / 1_000_000,
			activeRecs: v.activeRecs,
			dismissedRecs: v.dismissedRecs,
			appliedRecs: v.appliedRecs,
		})
	}
	return out
}

// ─── Read: admin dashboard data ─────────────────────────────────────────────

export const getAdminIntelligenceData = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.handler(async () => {
		const settings = await getAppSettings(db)
		const ai = await resolveAiConfig(db)
		const [analyzerStats, last24h, last7d, dailySeries, totalActiveRow, recentRuns, queueRow] = await Promise.all([
			loadAnalyzerStats(settings.intelligencePerAnalyzerEnabled),
			loadStatusBucket(24),
			loadStatusBucket(7 * 24),
			loadDailySeries(),
			db.select({ n: count() }).from(recommendations).where(eq(recommendations.status, 'active')),
			db
				.select({
					id: recommendationRuns.id,
					userId: recommendationRuns.userId,
					userName: users.name,
					userImage: users.image,
					startedAt: recommendationRuns.startedAt,
					finishedAt: recommendationRuns.finishedAt,
					status: recommendationRuns.status,
					trigger: recommendationRuns.trigger,
					skipReason: recommendationRuns.skipReason,
					error: recommendationRuns.error,
					tokensIn: recommendationRuns.tokensIn,
					tokensOut: recommendationRuns.tokensOut,
					cost: recommendationRuns.estimatedCostMicroUsd,
					inputHash: recommendationRuns.inputHash,
				})
				.from(recommendationRuns)
				.leftJoin(users, eq(users.id, recommendationRuns.userId))
				.orderBy(desc(recommendationRuns.startedAt))
				.limit(50),
			db.select({ overdue: count() }).from(users).where(eq(users.banned, false)),
		])

		// Per-run rec counts grouped by analyzer. Joined to the same set of
		// runs above (batchId === runId) so the table shows what each run
		// actually produced instead of always rendering "-".
		const runIds = recentRuns.map(r => r.id)
		const [runRecCounts, runStepRows] = await Promise.all([
			runIds.length === 0
				? Promise.resolve<Array<{ batchId: string; analyzerId: string; n: number }>>([])
				: db
						.select({
							batchId: recommendations.batchId,
							analyzerId: recommendations.analyzerId,
							n: count(),
						})
						.from(recommendations)
						.where(inArray(recommendations.batchId, runIds))
						.groupBy(recommendations.batchId, recommendations.analyzerId),
			// Step outcome breakdown per run. We classify each step as:
			//   - error: error column is non-null
			//   - ok:    a model call happened (prompt is non-null) without error
			//   - noop:  heuristic-only step with no model call
			// This lets the admin see "3 ok · 2 err · 1 noop" without us
			// having to lie about the run-level status.
			runIds.length === 0
				? Promise.resolve<Array<{ runId: string; hasError: boolean; hasPrompt: boolean; n: number }>>([])
				: db
						.select({
							runId: recommendationRunSteps.runId,
							hasError: sql<boolean>`${recommendationRunSteps.error} is not null`,
							hasPrompt: sql<boolean>`${recommendationRunSteps.prompt} is not null`,
							n: count(),
						})
						.from(recommendationRunSteps)
						.where(inArray(recommendationRunSteps.runId, runIds))
						.groupBy(
							recommendationRunSteps.runId,
							sql`${recommendationRunSteps.error} is not null`,
							sql`${recommendationRunSteps.prompt} is not null`
						),
		])
		const recCountMap = new Map<string, Record<string, number>>()
		for (const row of runRecCounts) {
			const cur = recCountMap.get(row.batchId) ?? {}
			cur[row.analyzerId] = row.n
			recCountMap.set(row.batchId, cur)
		}
		const stepCountMap = new Map<string, { ok: number; error: number; noop: number }>()
		for (const row of runStepRows) {
			const cur = stepCountMap.get(row.runId) ?? { ok: 0, error: 0, noop: 0 }
			if (row.hasError) cur.error += row.n
			else if (row.hasPrompt) cur.ok += row.n
			else cur.noop += row.n
			stepCountMap.set(row.runId, cur)
		}

		const today: (typeof dailySeries)[number] | undefined = dailySeries.at(-1)
		return {
			settings: {
				enabled: settings.intelligenceEnabled,
				refreshIntervalDays: settings.intelligenceRefreshIntervalDays,
				manualRefreshCooldownMinutes: settings.intelligenceManualRefreshCooldownMinutes,
				candidateCap: settings.intelligenceCandidateCap,
				concurrency: settings.intelligenceConcurrency,
				usersPerInvocation: settings.intelligenceUsersPerInvocation,
				staleRecRetentionDays: settings.intelligenceStaleRecRetentionDays,
				runStepsRetentionDays: settings.intelligenceRunStepsRetentionDays,
				upcomingWindowDays: settings.intelligenceUpcomingWindowDays,
				minDaysBeforeEventForRecs: settings.intelligenceMinDaysBeforeEventForRecs,
				listHygieneRenameWithAi: settings.intelligenceListHygieneRenameWithAi,
				dryRun: settings.intelligenceDryRun,
				modelOverride: settings.intelligenceModelOverride,
				email: {
					enabled: settings.intelligenceEmailEnabled,
					weeklyDigestEnabled: settings.intelligenceEmailWeeklyDigestEnabled,
					testRecipient: settings.intelligenceEmailTestRecipient,
				},
				perAnalyzerEnabled: settings.intelligencePerAnalyzerEnabled,
			},
			health: {
				totalActiveRecs: totalActiveRow[0].n,
				analyzers: analyzerStats,
				last24h,
				last7d,
				dailyTokensIn: today?.tokensIn ?? 0,
				dailyTokensOut: today?.tokensOut ?? 0,
				dailyEstimatedCostUsd: today?.costUsd ?? 0,
				queue: { overdue: queueRow[0].overdue, gatedByUnreadRecs: 0, lockHeld: 0 },
				provider: ai.isValid
					? {
							// FieldSource ('env' | 'db' | 'default' | 'missing') maps to the
							// admin-data shape ('env' | 'db' | 'override' | 'none'); 'default'
							// and 'missing' both surface as 'none' to the dashboard.
							source: (ai.providerType.source === 'env' || ai.providerType.source === 'db' ? ai.providerType.source : 'none') as
								| 'env'
								| 'db'
								| 'override'
								| 'none',
							provider: ai.providerType.value ?? null,
							model: ai.model.value ?? null,
						}
					: { source: 'none' as const, provider: null, model: null },
			},
			runs: recentRuns.map(r => ({
				id: r.id,
				userId: r.userId,
				userName: r.userName ?? 'unknown',
				userImage: r.userImage ?? null,
				startedAt: r.startedAt,
				finishedAt: r.finishedAt,
				status: r.status,
				trigger: r.trigger,
				skipReason: r.skipReason,
				error: r.error,
				tokensIn: r.tokensIn,
				tokensOut: r.tokensOut,
				estimatedCostUsd: r.cost / 1_000_000,
				durationMs: r.finishedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : null,
				inputHashShort: r.inputHash?.slice(0, 4) ?? null,
				recCounts: recCountMap.get(r.id) ?? ({} as Record<string, number>),
				stepCounts: stepCountMap.get(r.id) ?? { ok: 0, error: 0, noop: 0 },
			})),
			dailySeries,
		}
	})

// ─── Mutations ──────────────────────────────────────────────────────────────
//
// Settings updates go through the existing `updateAppSettings` server
// function in `src/api/settings.ts` (admin-gated, partial-schema parse,
// scrapeProviders encryption parity). Admin Intelligence UI just calls
// that server fn directly with the intelligence-namespaced keys.

const userIdSchema = z.object({ userId: z.string().min(1) })

export const adminRunForUser = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof userIdSchema>) => userIdSchema.parse(data))
	.handler(async ({ data }) => {
		return await generateForUser(db, data.userId, { trigger: 'manual', respectUnreadGuard: false })
	})

// "Run for me now" - resolves the admin's user id from the session. The
// admin route component doesn't have access to the session client-side
// (only via server fns), so we expose this dedicated entry instead of
// asking the client to pass its own id.
export const adminRunForMe = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.handler(async ({ context }) => {
		return await generateForUser(db, context.session.user.id, { trigger: 'manual', respectUnreadGuard: false })
	})

export const adminInvalidateInputHash = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof userIdSchema>) => userIdSchema.parse(data))
	.handler(async ({ data }) => {
		// Setting the most-recent successful run's hash to NULL forces the
		// next cron (or manual refresh) to bypass the unchanged-input skip
		// and regenerate.
		const result = await db
			.update(recommendationRuns)
			.set({ inputHash: null })
			.where(and(eq(recommendationRuns.userId, data.userId), eq(recommendationRuns.status, 'success')))
		return { ok: true as const, affected: result.rowCount ?? 0 }
	})

export const adminPurgeRecsForUser = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof userIdSchema>) => userIdSchema.parse(data))
	.handler(async ({ data }) => {
		const result = await db.delete(recommendations).where(eq(recommendations.userId, data.userId)).returning({ id: recommendations.id })
		return { ok: true as const, deleted: result.length }
	})

// ─── Read: per-user run summaries ───────────────────────────────────────────
//
// Powers the "Run for users" panel on the admin Intelligence page. Returns
// every non-banned user with their most recent run + active/dismissed/applied
// rec counts, so an admin can see at a glance who has stale recs, who has
// never run, and trigger a manual run for any of them.

export type AdminUserRunSummary = {
	userId: string
	name: string | null
	image: string | null
	email: string
	role: 'user' | 'admin' | 'child'
	isMe: boolean
	lastRunAt: Date | null
	lastRunStatus: 'running' | 'success' | 'error' | 'skipped' | null
	lastRunSkipReason: string | null
	activeRecs: number
	dismissedRecs: number
	appliedRecs: number
}

export const getAdminUserRunSummaries = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.handler(async ({ context }): Promise<Array<AdminUserRunSummary>> => {
		const me = context.session.user.id

		// One query per slice. The user table is small enough (admin tool) that
		// three round trips is fine and keeps the SQL readable.
		const userRows = await db
			.select({ id: users.id, name: users.name, email: users.email, image: users.image, role: users.role })
			.from(users)
			.where(eq(users.banned, false))
			.orderBy(asc(sql`lower(${users.name})`))

		// Most recent run per user (regardless of status).
		const lastRunRows = await db
			.select({
				userId: recommendationRuns.userId,
				startedAt: sql<Date>`max(${recommendationRuns.startedAt})`.as('startedAt'),
			})
			.from(recommendationRuns)
			.groupBy(recommendationRuns.userId)
		// `max(startedAt)` comes back through `sql<Date>` which doesn't run
		// drizzle's column-level Date parser, so the driver hands us an ISO
		// string in production. Coerce once so every downstream consumer
		// (the dedupe compare below, and the serialized `lastRunAt` field)
		// gets a real Date.
		const toDate = (v: Date | string): Date => (v instanceof Date ? v : new Date(v))
		const lastRunByUser = new Map(lastRunRows.map(r => [r.userId, toDate(r.startedAt)] as const))

		// Resolve those startedAt timestamps back to the run's status. We fetch
		// rows by (userId, startedAt) tuple, which keys the run uniquely
		// because startedAt is per-user-monotonic in practice.
		const lastRunDetailRows = lastRunRows.length
			? await db
					.select({
						userId: recommendationRuns.userId,
						startedAt: recommendationRuns.startedAt,
						status: recommendationRuns.status,
						skipReason: recommendationRuns.skipReason,
					})
					.from(recommendationRuns)
					.where(
						inArray(
							recommendationRuns.userId,
							lastRunRows.map(r => r.userId)
						)
					)
			: []
		const detailByUser = new Map<string, { status: AdminUserRunSummary['lastRunStatus']; skipReason: string | null }>()
		for (const row of lastRunDetailRows) {
			const ts = lastRunByUser.get(row.userId)
			if (!ts) continue
			if (row.startedAt.getTime() === ts.getTime()) {
				detailByUser.set(row.userId, { status: row.status, skipReason: row.skipReason })
			}
		}

		const recCountRows = await db
			.select({
				userId: recommendations.userId,
				status: recommendations.status,
				n: count(),
			})
			.from(recommendations)
			.groupBy(recommendations.userId, recommendations.status)
		const recCountsByUser = new Map<string, { active: number; dismissed: number; applied: number }>()
		for (const row of recCountRows) {
			const cur = recCountsByUser.get(row.userId) ?? { active: 0, dismissed: 0, applied: 0 }
			if (row.status === 'active') cur.active = row.n
			else if (row.status === 'dismissed') cur.dismissed = row.n
			else cur.applied = row.n
			recCountsByUser.set(row.userId, cur)
		}

		return userRows.map(u => {
			const detail = detailByUser.get(u.id) ?? null
			const counts = recCountsByUser.get(u.id) ?? { active: 0, dismissed: 0, applied: 0 }
			return {
				userId: u.id,
				name: u.name,
				image: u.image,
				email: u.email,
				role: u.role,
				isMe: u.id === me,
				lastRunAt: lastRunByUser.get(u.id) ?? null,
				lastRunStatus: detail?.status ?? null,
				lastRunSkipReason: detail?.skipReason ?? null,
				activeRecs: counts.active,
				dismissedRecs: counts.dismissed,
				appliedRecs: counts.applied,
			}
		})
	})

// ─── Read: per-run debug detail ─────────────────────────────────────────────
//
// Powers the "click a row" debug panel on the admin Intelligence page so
// "4 ok" runs aren't a black box. Admins can see the exact prompt sent
// to each analyzer, the raw model response, the parsed output, and which
// recommendations were persisted (or why none were, for heuristic-only
// or empty-output runs).

const runIdSchema = z.object({ runId: z.string().min(1) })

export const getAdminRunDetail = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof runIdSchema>) => runIdSchema.parse(data))
	.handler(async ({ data }) => {
		const runRows = await db
			.select({
				id: recommendationRuns.id,
				userId: recommendationRuns.userId,
				userName: users.name,
				userImage: users.image,
				startedAt: recommendationRuns.startedAt,
				finishedAt: recommendationRuns.finishedAt,
				status: recommendationRuns.status,
				trigger: recommendationRuns.trigger,
				skipReason: recommendationRuns.skipReason,
				error: recommendationRuns.error,
				tokensIn: recommendationRuns.tokensIn,
				tokensOut: recommendationRuns.tokensOut,
				cost: recommendationRuns.estimatedCostMicroUsd,
				inputHash: recommendationRuns.inputHash,
			})
			.from(recommendationRuns)
			.leftJoin(users, eq(users.id, recommendationRuns.userId))
			.where(eq(recommendationRuns.id, data.runId))
			.limit(1)
		if (runRows.length === 0) {
			throw new Error(`run ${data.runId} not found`)
		}
		const runRow = runRows[0]

		const [stepRows, recRows] = await Promise.all([
			db
				.select({
					id: recommendationRunSteps.id,
					analyzer: recommendationRunSteps.analyzer,
					prompt: recommendationRunSteps.prompt,
					responseRaw: recommendationRunSteps.responseRaw,
					parsed: recommendationRunSteps.parsed,
					tokensIn: recommendationRunSteps.tokensIn,
					tokensOut: recommendationRunSteps.tokensOut,
					latencyMs: recommendationRunSteps.latencyMs,
					error: recommendationRunSteps.error,
					createdAt: recommendationRunSteps.createdAt,
				})
				.from(recommendationRunSteps)
				.where(eq(recommendationRunSteps.runId, data.runId))
				.orderBy(asc(recommendationRunSteps.id)),
			db
				.select({
					id: recommendations.id,
					analyzerId: recommendations.analyzerId,
					kind: recommendations.kind,
					status: recommendations.status,
					severity: recommendations.severity,
					title: recommendations.title,
					body: recommendations.body,
					payload: recommendations.payload,
					fingerprint: recommendations.fingerprint,
					createdAt: recommendations.createdAt,
					dismissedAt: recommendations.dismissedAt,
				})
				.from(recommendations)
				.where(eq(recommendations.batchId, data.runId))
				.orderBy(asc(recommendations.analyzerId), asc(recommendations.createdAt)),
		])

		// jsonb columns come back from drizzle typed as `unknown`. The server-fn
		// return type checker requires JSON-serializable shapes, so we stringify
		// `parsed` and `payload` here and let the panel re-parse / pretty-print
		// for display. This sidesteps the `{}` vs `unknown` mismatch and keeps
		// the wire payload self-describing.
		return {
			run: {
				id: runRow.id,
				userId: runRow.userId,
				userName: runRow.userName ?? 'unknown',
				userImage: runRow.userImage ?? null,
				startedAt: runRow.startedAt,
				finishedAt: runRow.finishedAt,
				status: runRow.status,
				trigger: runRow.trigger,
				skipReason: runRow.skipReason,
				error: runRow.error,
				tokensIn: runRow.tokensIn,
				tokensOut: runRow.tokensOut,
				estimatedCostUsd: runRow.cost / 1_000_000,
				durationMs: runRow.finishedAt ? runRow.finishedAt.getTime() - runRow.startedAt.getTime() : null,
				inputHash: runRow.inputHash,
			},
			steps: stepRows.map(s => ({
				id: s.id,
				analyzerId: s.analyzer,
				analyzerLabel: getAnalyzer(s.analyzer)?.label ?? s.analyzer,
				prompt: s.prompt,
				responseRaw: s.responseRaw,
				parsedJson: s.parsed == null ? null : JSON.stringify(s.parsed),
				tokensIn: s.tokensIn,
				tokensOut: s.tokensOut,
				latencyMs: s.latencyMs,
				error: s.error,
			})),
			recs: recRows.map(r => ({
				id: r.id,
				analyzerId: r.analyzerId,
				analyzerLabel: getAnalyzer(r.analyzerId)?.label ?? r.analyzerId,
				kind: r.kind,
				status: r.status,
				severity: r.severity,
				title: r.title,
				body: r.body,
				payloadJson: r.payload == null ? null : JSON.stringify(r.payload),
				fingerprint: r.fingerprint,
				createdAt: r.createdAt,
				dismissedAt: r.dismissedAt,
			})),
		}
	})
