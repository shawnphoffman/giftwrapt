import { createServerFn } from '@tanstack/react-start'
import { and, avg, count, desc, eq, gte, sql, sum } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { recommendationRuns, recommendationRunSteps, recommendations, users } from '@/db/schema'
import { resolveAiConfig } from '@/lib/ai-config'
import { ANALYZERS } from '@/lib/intelligence/registry'
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
	const rows = await db
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
		.orderBy(sql`${recommendationRuns.startedAt}::date asc`)

	const map = new Map<
		string,
		{ runsSuccess: number; runsSkipped: number; runsError: number; tokensIn: number; tokensOut: number; costMicro: number }
	>()
	for (const r of rows) {
		const cur = map.get(r.date) ?? { runsSuccess: 0, runsSkipped: 0, runsError: 0, tokensIn: 0, tokensOut: 0, costMicro: 0 }
		if (r.status === 'success') cur.runsSuccess += r.n
		else if (r.status === 'error') cur.runsError += r.n
		else cur.runsSkipped += r.n
		cur.tokensIn += r.tokensIn
		cur.tokensOut += r.tokensOut
		cur.costMicro += r.cost
		map.set(r.date, cur)
	}

	const out = []
	for (let i = 13; i >= 0; i--) {
		const d = new Date()
		d.setDate(d.getDate() - i)
		const key = d.toISOString().slice(0, 10)
		const v = map.get(key) ?? { runsSuccess: 0, runsSkipped: 0, runsError: 0, tokensIn: 0, tokensOut: 0, costMicro: 0 }
		out.push({
			date: key,
			runsSuccess: v.runsSuccess,
			runsSkipped: v.runsSkipped,
			runsError: v.runsError,
			tokensIn: v.tokensIn,
			tokensOut: v.tokensOut,
			costUsd: v.costMicro / 1_000_000,
			activeRecs: 0,
			dismissedRecs: 0,
			appliedRecs: 0,
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
				recCounts: {} as Record<string, number>,
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
