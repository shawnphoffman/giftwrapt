import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db, type SchemaDatabase } from '@/db'
import { itemGroups, items, lists, recommendationRuns, recommendations } from '@/db/schema'
import { resolveAiConfig } from '@/lib/ai-config'
import { generateForUser } from '@/lib/intelligence/runner'
import { loggingMiddleware } from '@/lib/logger'
import { canEditList } from '@/lib/permissions'
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

// ─── Mutate: apply a recommendation action ──────────────────────────────────
//
// Currently only handles `kind: 'create-group'`, emitted by the grouping
// analyzer. Runs the create-group transaction inside one DB transaction so
// the rec status flips alongside the data change. Any precondition failure
// (rec stale, edit denied, items moved) returns a structured error and the
// rec stays `active` so the user can dismiss it explicitly.

const applyInputSchema = z.object({
	id: z.uuid(),
	apply: z.object({
		kind: z.literal('create-group'),
		listId: z.string(),
		groupType: z.enum(['or', 'order']),
		itemIds: z.array(z.string()).min(2),
		priority: z.enum(['very-high', 'high', 'normal', 'low']),
	}),
})

export type ApplyRecommendationResult =
	| { ok: true; groupId: string }
	| { ok: false; reason: 'rec-not-found' | 'rec-not-active' | 'list-not-found' | 'cannot-edit' | 'items-changed' | 'unknown-apply-kind' }

// Reusable impl that any caller (server fn, integration tests, future
// background workers) can invoke against a transaction. Auth + input
// parsing is the server-fn wrapper's job.
export async function applyRecommendationImpl(
	tx: SchemaDatabase,
	userId: string,
	input: z.infer<typeof applyInputSchema>
): Promise<ApplyRecommendationResult> {
	const listIdNum = Number.parseInt(input.apply.listId, 10)
	const itemIdNums = input.apply.itemIds.map(id => Number.parseInt(id, 10))
	if (!Number.isFinite(listIdNum) || itemIdNums.some(n => !Number.isFinite(n))) {
		return { ok: false, reason: 'items-changed' }
	}

	const rec = await tx.query.recommendations.findFirst({
		where: and(eq(recommendations.id, input.id), eq(recommendations.userId, userId)),
		columns: { id: true, status: true },
	})
	if (!rec) return { ok: false, reason: 'rec-not-found' }
	if (rec.status !== 'active') return { ok: false, reason: 'rec-not-active' }

	const list = await tx.query.lists.findFirst({
		where: eq(lists.id, listIdNum),
		columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
	})
	if (!list) return { ok: false, reason: 'list-not-found' }

	// Owner short-circuit mirrors `assertCanEditItems` in src/api/_items-impl.ts;
	// canEditList itself doesn't grant the owner because it's only ever called
	// behind an owner-fast-path elsewhere in the codebase.
	if (list.ownerId !== userId) {
		const editGate = await canEditList(userId, list, tx)
		if (!editGate.ok) return { ok: false, reason: 'cannot-edit' }
	}

	const itemRows = await tx
		.select({ id: items.id, groupId: items.groupId, listId: items.listId, isArchived: items.isArchived })
		.from(items)
		.where(inArray(items.id, itemIdNums))
	if (itemRows.length !== itemIdNums.length) return { ok: false, reason: 'items-changed' }
	for (const row of itemRows) {
		if (row.listId !== listIdNum) return { ok: false, reason: 'items-changed' }
		if (row.isArchived) return { ok: false, reason: 'items-changed' }
		if (row.groupId !== null) return { ok: false, reason: 'items-changed' }
	}

	const inserted = await tx
		.insert(itemGroups)
		.values({ listId: listIdNum, type: input.apply.groupType, priority: input.apply.priority })
		.returning({ id: itemGroups.id })
	const newGroupId = inserted[0].id

	for (let i = 0; i < itemIdNums.length; i++) {
		await tx.update(items).set({ groupId: newGroupId, groupSortOrder: i }).where(eq(items.id, itemIdNums[i]))
	}

	await tx.update(recommendations).set({ status: 'applied' }).where(eq(recommendations.id, input.id))

	return { ok: true, groupId: String(newGroupId) }
}

export const applyRecommendation = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof applyInputSchema>) => applyInputSchema.parse(data))
	.handler(async ({ context, data }): Promise<ApplyRecommendationResult> => {
		const userId = context.session.user.id
		return await db.transaction(async tx => applyRecommendationImpl(tx, userId, data))
	})
