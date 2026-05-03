import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, gt, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { recommendationRuns, recommendations } from '@/db/schema'
import { resolveAiConfig } from '@/lib/ai-config'
import { generateForUser } from '@/lib/intelligence/runner'
import { loggingMiddleware } from '@/lib/logger'
import { intelligenceRefreshLimiter } from '@/lib/rate-limits'
import { getAppSettings } from '@/lib/settings-loader'
import { authMiddleware } from '@/middleware/auth'
import { rateLimit } from '@/middleware/rate-limit'

// ─── Types returned to the client ───────────────────────────────────────────

export type IntelligenceRecRow = {
	id: string
	analyzerId: string
	kind: string
	severity: 'info' | 'suggest' | 'important'
	status: 'active' | 'dismissed' | 'applied'
	title: string
	body: string
	createdAt: Date
	dismissedAt: Date | null
	payload: Record<string, never> | null
}

export type IntelligencePagePayload = {
	enabled: boolean
	providerConfigured: boolean
	recs: Array<IntelligenceRecRow>
	lastRun: {
		id: string
		startedAt: Date
		finishedAt: Date | null
		status: 'running' | 'success' | 'error' | 'skipped'
		trigger: 'cron' | 'manual'
		error: string | null
		skipReason: string | null
	} | null
	nextEligibleRefreshAt: Date | null
}

// ─── Read: get my recommendations ───────────────────────────────────────────

export const getMyRecommendations = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(async ({ context }) => {
		const userId = context.session.user.id
		const settings = await getAppSettings(db)
		const aiConfig = await resolveAiConfig(db)

		const [recs, lastRunRow] = await Promise.all([
			db
				.select({
					id: recommendations.id,
					analyzerId: recommendations.analyzerId,
					kind: recommendations.kind,
					severity: recommendations.severity,
					status: recommendations.status,
					title: recommendations.title,
					body: recommendations.body,
					createdAt: recommendations.createdAt,
					dismissedAt: recommendations.dismissedAt,
					payload: recommendations.payload,
				})
				.from(recommendations)
				.where(eq(recommendations.userId, userId))
				.orderBy(desc(recommendations.createdAt)),
			db
				.select()
				.from(recommendationRuns)
				.where(eq(recommendationRuns.userId, userId))
				.orderBy(desc(recommendationRuns.startedAt))
				.limit(1),
		])

		const lastRun: (typeof lastRunRow)[number] | null = lastRunRow.length > 0 ? lastRunRow[0] : null
		const cooldownMs = settings.intelligenceManualRefreshCooldownMinutes * 60_000
		const lastFinished = lastRun?.finishedAt
		const nextEligibleRefreshAt = lastFinished ? new Date(lastFinished.getTime() + cooldownMs) : null

		return {
			enabled: settings.intelligenceEnabled,
			providerConfigured: aiConfig.isValid,
			recs: recs.map(r => ({ ...r, payload: r.payload as Record<string, never> | null })),
			lastRun: lastRun
				? {
						id: lastRun.id,
						startedAt: lastRun.startedAt,
						finishedAt: lastRun.finishedAt,
						status: lastRun.status,
						trigger: lastRun.trigger,
						error: lastRun.error,
						skipReason: lastRun.skipReason,
					}
				: null,
			nextEligibleRefreshAt,
		}
	})

// ─── Mutate: refresh ────────────────────────────────────────────────────────

export const refreshMyRecommendations = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, rateLimit(intelligenceRefreshLimiter), loggingMiddleware])
	.handler(async ({ context }) => {
		const userId = context.session.user.id
		const settings = await getAppSettings(db)

		// Per-user cooldown enforced at the server-fn layer so the user gets
		// a clear "try again later" instead of a silent rate-limit error.
		const cooldownMs = settings.intelligenceManualRefreshCooldownMinutes * 60_000
		const earliest = new Date(Date.now() - cooldownMs)
		const recent = await db
			.select({ id: recommendationRuns.id })
			.from(recommendationRuns)
			.where(
				and(eq(recommendationRuns.userId, userId), eq(recommendationRuns.trigger, 'manual'), gt(recommendationRuns.startedAt, earliest))
			)
			.limit(1)
		if (recent.length > 0) {
			return { status: 'skipped' as const, reason: 'cooldown' }
		}

		return await generateForUser(db, userId, { trigger: 'manual', respectUnreadGuard: false })
	})

// ─── Mutate: dismiss / mark applied ─────────────────────────────────────────

const recIdSchema = z.object({ id: z.uuid() })

export const dismissRecommendation = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof recIdSchema>) => recIdSchema.parse(data))
	.handler(async ({ context, data }) => {
		const userId = context.session.user.id
		const result = await db
			.update(recommendations)
			.set({ status: 'dismissed', dismissedAt: sql`now()` })
			.where(and(eq(recommendations.id, data.id), eq(recommendations.userId, userId)))
			.returning({ id: recommendations.id })
		return { ok: result.length > 0 }
	})

export const markRecommendationApplied = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof recIdSchema>) => recIdSchema.parse(data))
	.handler(async ({ context, data }) => {
		const userId = context.session.user.id
		const result = await db
			.update(recommendations)
			.set({ status: 'applied' })
			.where(and(eq(recommendations.id, data.id), eq(recommendations.userId, userId)))
			.returning({ id: recommendations.id })
		return { ok: result.length > 0 }
	})
