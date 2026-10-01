// Impls behind the suggestions page server fns (`intelligence.ts`) and the
// MCP intelligence tools. Lives in its own server-only module so the
// server-fn file never carries a top-level reference to the runner (whose
// import chain reaches `node:crypto`) into the client graph. `dbx` is
// injectable for the integration harness; the AI config and the runner
// want the pg-backed singleton.

import { and, asc, desc, eq, gt, sql } from 'drizzle-orm'

import { db, type SchemaDatabase } from '@/db'
import { dependentGuardianships, dependents, recommendationRuns, recommendations, recommendationSubItemDismissals } from '@/db/schema'
import { resolveAiConfig } from '@/lib/ai-config'
import { generateForUser } from '@/lib/intelligence/runner'
import { getAppSettings } from '@/lib/settings-loader'

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
	dependentId: string | null
	payload: Record<string, never> | null
	// Sub-item ids the user has dismissed via per-sub-item Skip. Read-side
	// filter; the payload's `subItems` field still contains every current
	// sub-item, so the client knows whether the bundle has anything left
	// to render and the dismissals are easy to debug.
	dismissedSubItemIds?: Array<string>
}

export type IntelligenceDependentRecGroup = {
	dependent: { id: string; name: string; image: string | null }
	recs: Array<IntelligenceRecRow>
}

export type IntelligencePagePayload = {
	enabled: boolean
	providerConfigured: boolean
	// Recs the user owns directly (recommendations.dependentId IS NULL).
	recs: Array<IntelligenceRecRow>
	// Recs scoped to each dependent the user guardians, sorted by dependent
	// name. Empty when there are no dependent recs (or no dependents).
	byDependent: Array<IntelligenceDependentRecGroup>
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

// Reusable read behind the suggestions page and the MCP `list_recommendations`
// tool. `dbx` is injectable for the integration harness.
export async function getMyRecommendationsImpl(userId: string, dbx: SchemaDatabase = db): Promise<IntelligencePagePayload> {
	const settings = await getAppSettings(dbx)
	const aiConfig = await resolveAiConfig(db)

	const [allRecs, allSubItemDismissals, lastRunRow, guardianedDeps] = await Promise.all([
		dbx
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
				dependentId: recommendations.dependentId,
				payload: recommendations.payload,
				fingerprint: recommendations.fingerprint,
			})
			.from(recommendations)
			.where(eq(recommendations.userId, userId))
			.orderBy(desc(recommendations.createdAt)),
		dbx
			.select({
				fingerprint: recommendationSubItemDismissals.fingerprint,
				subItemId: recommendationSubItemDismissals.subItemId,
			})
			.from(recommendationSubItemDismissals)
			.where(eq(recommendationSubItemDismissals.userId, userId)),
		dbx.select().from(recommendationRuns).where(eq(recommendationRuns.userId, userId)).orderBy(desc(recommendationRuns.startedAt)).limit(1),
		// Dependents the user guardians, joined with the dependent row
		// itself so we have name + image for the section header. Sorted by
		// name so the UI order is stable across regenerations.
		dbx
			.select({ id: dependents.id, name: dependents.name, image: dependents.image })
			.from(dependentGuardianships)
			.innerJoin(dependents, eq(dependentGuardianships.dependentId, dependents.id))
			.where(eq(dependentGuardianships.guardianUserId, userId))
			.orderBy(asc(dependents.name)),
	])

	const lastRun: (typeof lastRunRow)[number] | null = lastRunRow.length > 0 ? lastRunRow[0] : null
	const cooldownMs = settings.intelligenceManualRefreshCooldownMinutes * 60_000
	const lastFinished = lastRun?.finishedAt
	const nextEligibleRefreshAt = lastFinished ? new Date(lastFinished.getTime() + cooldownMs) : null

	// Group dismissals by fingerprint so each rec gets its slice without
	// scanning the full list.
	const dismissalsByFingerprint = new Map<string, Array<string>>()
	for (const d of allSubItemDismissals) {
		const arr = dismissalsByFingerprint.get(d.fingerprint) ?? []
		arr.push(d.subItemId)
		dismissalsByFingerprint.set(d.fingerprint, arr)
	}

	const userRecs: Array<IntelligenceRecRow> = []
	const recsByDep = new Map<string, Array<IntelligenceRecRow>>()
	for (const r of allRecs) {
		const dismissedSubItemIds = dismissalsByFingerprint.get(r.fingerprint) ?? []
		// Auto-hide a bundle whose every sub-item has been dismissed: the
		// user clicked Skip on each row. The DB row stays `active` so a
		// regen with new candidates re-surfaces it; for now it just
		// doesn't render. This is the "auto-empty bundle" rule.
		if (r.status === 'active' && dismissedSubItemIds.length > 0) {
			const payload = (r.payload ?? {}) as { subItems?: Array<{ id: string }> }
			const subItems = payload.subItems ?? []
			if (subItems.length > 0 && subItems.every(s => dismissedSubItemIds.includes(s.id))) {
				continue
			}
		}
		const { fingerprint: _fp, ...rest } = r
		const row: IntelligenceRecRow = {
			...rest,
			payload: r.payload as Record<string, never> | null,
			dismissedSubItemIds: dismissedSubItemIds.length > 0 ? dismissedSubItemIds : undefined,
		}
		if (r.dependentId === null) {
			userRecs.push(row)
		} else {
			const arr = recsByDep.get(r.dependentId) ?? []
			arr.push(row)
			recsByDep.set(r.dependentId, arr)
		}
	}

	const byDependent: Array<IntelligenceDependentRecGroup> = []
	for (const dep of guardianedDeps) {
		const recs = recsByDep.get(dep.id)
		if (!recs || recs.length === 0) continue
		byDependent.push({ dependent: { id: dep.id, name: dep.name, image: dep.image }, recs })
	}

	return {
		enabled: settings.intelligenceEnabled,
		providerConfigured: aiConfig.isValid,
		recs: userRecs,
		byDependent,
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
}

// Manual refresh with the per-user cooldown. Shared by the server fn and the
// MCP `refresh_recommendations` tool.
export async function refreshMyRecommendationsImpl(userId: string, dbx: SchemaDatabase = db) {
	const settings = await getAppSettings(dbx)

	// Per-user cooldown enforced here so the caller gets a clear "try again
	// later" instead of a silent rate-limit error.
	const cooldownMs = settings.intelligenceManualRefreshCooldownMinutes * 60_000
	const earliest = new Date(Date.now() - cooldownMs)
	const recent = await dbx
		.select({ id: recommendationRuns.id })
		.from(recommendationRuns)
		.where(and(eq(recommendationRuns.userId, userId), eq(recommendationRuns.trigger, 'manual'), gt(recommendationRuns.startedAt, earliest)))
		.limit(1)
	if (recent.length > 0) {
		return { status: 'skipped' as const, reason: 'cooldown' }
	}

	return await generateForUser(db, userId, { trigger: 'manual' })
}

export async function dismissRecommendationImpl(userId: string, id: string, dbx: SchemaDatabase = db): Promise<{ ok: boolean }> {
	const result = await dbx
		.update(recommendations)
		.set({ status: 'dismissed', dismissedAt: sql`now()` })
		.where(and(eq(recommendations.id, id), eq(recommendations.userId, userId)))
		.returning({ id: recommendations.id })
	return { ok: result.length > 0 }
}

export async function reactivateRecommendationImpl(userId: string, id: string, dbx: SchemaDatabase = db): Promise<{ ok: boolean }> {
	const result = await dbx
		.update(recommendations)
		.set({ status: 'active', dismissedAt: null })
		.where(and(eq(recommendations.id, id), eq(recommendations.userId, userId)))
		.returning({ id: recommendations.id })
	return { ok: result.length > 0 }
}
