// Reads and housekeeping for the `ai_usage` ledger. Writes happen in
// src/lib/ai-call.ts, next to the model call they account for.

import { desc, eq, gte, lt, sql } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { aiUsage, users } from '@/db/schema'

export type AiUsageFeatureSummary = {
	feature: string
	calls: number
	errors: number
	tokensIn: number
	tokensOut: number
	estimatedCostMicroUsd: number
}

export type AiUsageSourceSummary = {
	// Null for rows written before the source column existed.
	source: string | null
	calls: number
	estimatedCostMicroUsd: number
}

export type AiUsageRecentCall = {
	id: number
	createdAt: string
	feature: string
	source: string | null
	// Display name of the user the call was for; null when there was none.
	userName: string | null
	model: string | null
	tokensIn: number
	tokensOut: number
	estimatedCostMicroUsd: number
	outcome: string
}

export type AiUsageSummary = {
	days: number
	features: Array<AiUsageFeatureSummary>
	sources: Array<AiUsageSourceSummary>
	recent: Array<AiUsageRecentCall>
	total: Omit<AiUsageFeatureSummary, 'feature'>
	monthToDateCostMicroUsd: number
}

/** First instant of the UTC calendar month containing `now`. */
export function monthStartUtc(now: Date): Date {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

// No upper bound on purpose: a row written a moment ago can carry a
// database timestamp at or just past the caller's `now`, and must count.
export async function getMonthToDateCostMicroUsd(db: SchemaDatabase, now: Date): Promise<number> {
	const [row] = await db
		.select({ cost: sql<number>`coalesce(sum(${aiUsage.estimatedCostMicroUsd}), 0)`.mapWith(Number) })
		.from(aiUsage)
		.where(gte(aiUsage.createdAt, monthStartUtc(now)))
	return row.cost
}

// The latest calls with who they were for and where they came from. No
// prompt or response text exists to show; the ledger never stores it.
export async function getRecentAiCalls(db: SchemaDatabase, limit: number): Promise<Array<AiUsageRecentCall>> {
	const rows = await db
		.select({
			id: aiUsage.id,
			createdAt: aiUsage.createdAt,
			feature: aiUsage.feature,
			source: aiUsage.source,
			userName: sql<string | null>`coalesce(${users.name}, ${users.email})`,
			model: aiUsage.model,
			tokensIn: aiUsage.tokensIn,
			tokensOut: aiUsage.tokensOut,
			estimatedCostMicroUsd: aiUsage.estimatedCostMicroUsd,
			outcome: aiUsage.outcome,
		})
		.from(aiUsage)
		.leftJoin(users, eq(users.id, aiUsage.userId))
		.orderBy(desc(aiUsage.createdAt), desc(aiUsage.id))
		.limit(limit)
	return rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() }))
}

export async function getAiUsageSummary(args: {
	db: SchemaDatabase
	now: Date
	days?: number
	recentLimit?: number
}): Promise<AiUsageSummary> {
	const days = args.days ?? 30
	const since = new Date(args.now.getTime() - days * 86_400_000)
	const rows = await args.db
		.select({
			feature: aiUsage.feature,
			calls: sql<number>`count(*)`.mapWith(Number),
			errors: sql<number>`count(*) filter (where ${aiUsage.outcome} = 'error')`.mapWith(Number),
			tokensIn: sql<number>`coalesce(sum(${aiUsage.tokensIn}), 0)`.mapWith(Number),
			tokensOut: sql<number>`coalesce(sum(${aiUsage.tokensOut}), 0)`.mapWith(Number),
			estimatedCostMicroUsd: sql<number>`coalesce(sum(${aiUsage.estimatedCostMicroUsd}), 0)`.mapWith(Number),
		})
		.from(aiUsage)
		.where(gte(aiUsage.createdAt, since))
		.groupBy(aiUsage.feature)
	const features = rows.sort((a, b) => b.estimatedCostMicroUsd - a.estimatedCostMicroUsd || a.feature.localeCompare(b.feature))
	const total = features.reduce(
		(acc, f) => ({
			calls: acc.calls + f.calls,
			errors: acc.errors + f.errors,
			tokensIn: acc.tokensIn + f.tokensIn,
			tokensOut: acc.tokensOut + f.tokensOut,
			estimatedCostMicroUsd: acc.estimatedCostMicroUsd + f.estimatedCostMicroUsd,
		}),
		{ calls: 0, errors: 0, tokensIn: 0, tokensOut: 0, estimatedCostMicroUsd: 0 }
	)
	const sourceRows = await args.db
		.select({
			source: aiUsage.source,
			calls: sql<number>`count(*)`.mapWith(Number),
			estimatedCostMicroUsd: sql<number>`coalesce(sum(${aiUsage.estimatedCostMicroUsd}), 0)`.mapWith(Number),
		})
		.from(aiUsage)
		.where(gte(aiUsage.createdAt, since))
		.groupBy(aiUsage.source)
	const sources = sourceRows.sort((a, b) => b.calls - a.calls || (a.source ?? '').localeCompare(b.source ?? ''))
	return {
		days,
		features,
		sources,
		recent: await getRecentAiCalls(args.db, args.recentLimit ?? 25),
		total,
		monthToDateCostMicroUsd: await getMonthToDateCostMicroUsd(args.db, args.now),
	}
}

export async function sweepAiUsage(args: { db: SchemaDatabase; now: Date; retentionDays: number }): Promise<{ deleted: number }> {
	const cutoff = new Date(args.now.getTime() - args.retentionDays * 86_400_000)
	const rows = await args.db.delete(aiUsage).where(lt(aiUsage.createdAt, cutoff)).returning({ id: aiUsage.id })
	return { deleted: rows.length }
}
