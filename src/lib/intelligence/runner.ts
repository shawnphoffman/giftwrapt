import { type LanguageModel } from 'ai'
import { and, count, eq, inArray, sql } from 'drizzle-orm'

import type { Database } from '@/db'
import {
	dependentGuardianships,
	dependents,
	intelligenceLockKeySql,
	lists,
	type NewRecommendation,
	type NewRecommendationRun,
	type NewRecommendationRunStep,
	recommendationRuns,
	recommendationRunSteps,
	recommendations,
	type RecommendationStatus,
	recommendationSubItemDismissals,
	users,
} from '@/db/schema'
import { createAiModel } from '@/lib/ai-client'
import { resolveAiConfig } from '@/lib/ai-config'
import { createLogger } from '@/lib/logger'
import { type AppSettings, DEFAULT_APP_SETTINGS } from '@/lib/settings'
import { getAppSettings } from '@/lib/settings-loader'

import type { AnalyzerContext, AnalyzerSubject } from './context'
import { fingerprintFor } from './fingerprint'
import { combineHashes } from './hash'
import { notifyForRun } from './notify'
import { checkPreconditions } from './preconditions'
import { ANALYZERS, isAnalyzerEnabled } from './registry'
import { type AnalyzerRecOutput, type AnalyzerStep, recPayloadSchema } from './types'

const log = createLogger('intelligence-runner')

export type RunTrigger = 'cron' | 'manual'

export type RunResult =
	| { status: 'success'; runId: string; recCount: number }
	| { status: 'skipped'; runId: string | null; reason: string }
	| { status: 'error'; runId: string | null; error: string }

export type GenerateForUserOptions = {
	trigger: RunTrigger
	// When false (cron), runs are skipped if the user has any active recs
	// from a prior batch. Manual triggers ignore this guard.
	respectUnreadGuard?: boolean
}

// Main entry point. Same signature whether called from cron, the manual
// server function, the run-once CLI, or a long-lived worker.
export async function generateForUser(db: Database, userId: string, opts: GenerateForUserOptions): Promise<RunResult> {
	const settings = await loadSettings(db)
	const respectUnreadGuard = opts.respectUnreadGuard ?? opts.trigger === 'cron'

	const pre = await checkPreconditions({ db, settings })
	if (pre.skipReason) {
		return { status: 'skipped', runId: null, reason: pre.skipReason }
	}

	// Try to grab the per-user advisory lock. Released at end of session.
	const lockKey = intelligenceLockKeySql(userId)
	const lockRes = await db.execute<{ acquired: boolean }>(sql`select pg_try_advisory_lock(${lockKey}) as acquired`)
	const acquired = lockRes.rows[0]?.acquired === true
	if (!acquired) {
		return { status: 'skipped', runId: null, reason: 'lock-held' }
	}

	try {
		// Skip-if-unread guard (cron only).
		if (respectUnreadGuard) {
			const [{ value: unread }] = await db
				.select({ value: count() })
				.from(recommendations)
				.where(and(eq(recommendations.userId, userId), eq(recommendations.status, 'active')))
			if (unread > 0) {
				return { status: 'skipped', runId: null, reason: 'unread-recs-exist' }
			}
		}

		const model = await resolveModel(db, settings)
		const now = new Date()

		// Resolve the recipient subjects for this run: the user (always) +
		// every dependent the user guardians who has at least one active
		// non-giftideas list owned by the user. Each subject becomes a
		// separate analyzer pass; outputs are persisted in one batch so
		// the per-user advisory lock and skip semantics still cover all of
		// them atomically.
		const userSubject = await loadUserSubject(db, userId)
		const dependentSubjects = await loadDependentSubjects(db, userId)
		const passes: Array<{ dependentId: string | null; subject: AnalyzerSubject }> = [
			{ dependentId: null, subject: userSubject },
			...dependentSubjects.map(d => ({ dependentId: d.id, subject: d as AnalyzerSubject })),
		]

		// Open a run row up front so admins can see "running" state.
		const [run] = await db
			.insert(recommendationRuns)
			.values({
				userId,
				trigger: opts.trigger,
				status: 'running',
			} satisfies NewRecommendationRun)
			.returning({ id: recommendationRuns.id })

		try {
			const allOutputs: Array<AnalyzerRecOutput & { analyzerId: string; dependentId: string | null }> = []
			const allSteps: Array<NewRecommendationRunStep> = []
			const inputHashSlices: Array<string | null> = []
			let totalIn = 0
			let totalOut = 0

			for (const pass of passes) {
				const ctx: AnalyzerContext = {
					db,
					userId,
					model,
					settings,
					logger: log,
					now,
					candidateCap: settings.intelligenceCandidateCap,
					dryRun: settings.intelligenceDryRun,
					dependentId: pass.dependentId,
					subject: pass.subject,
				}
				for (const analyzer of ANALYZERS) {
					if (!isAnalyzerEnabled(analyzer, settings.intelligencePerAnalyzerEnabled)) continue
					try {
						const result = await analyzer.run(ctx)
						// Tag the input-hash slice with the dependent scope so a
						// rec set that's identical "shape" but different scope
						// doesn't collide on the unchanged-input guard.
						inputHashSlices.push(result.inputHash ? `${pass.dependentId ?? 'self'}:${result.inputHash}` : result.inputHash)
						for (const rec of result.recs) {
							allOutputs.push({ ...rec, analyzerId: analyzer.id, dependentId: pass.dependentId })
						}
						for (const step of result.steps) {
							totalIn += step.tokensIn ?? 0
							totalOut += step.tokensOut ?? 0
							allSteps.push(stepRow(run.id, analyzer.id, step))
						}
					} catch (err) {
						const msg = err instanceof Error ? err.message : String(err)
						allSteps.push({
							runId: run.id,
							analyzer: analyzer.id,
							prompt: null,
							responseRaw: null,
							parsed: null,
							tokensIn: 0,
							tokensOut: 0,
							latencyMs: 0,
							error: msg,
						})
						log.warn({ analyzer: analyzer.id, dependentId: pass.dependentId, err: msg }, 'analyzer threw; continuing')
					}
				}
			}

			// Idempotent skip: when cron triggers and the input hash matches the
			// last successful run AND we're inside the refresh window, skip.
			const combinedHash = combineHashes(inputHashSlices)
			if (opts.trigger === 'cron' && combinedHash) {
				const lastSuccess = await getLastSuccessHash(db, userId)
				if (lastSuccess?.inputHash === combinedHash && lastSuccess.finishedAt) {
					const ageDays = (Date.now() - lastSuccess.finishedAt.getTime()) / 86400000
					if (ageDays < settings.intelligenceRefreshIntervalDays) {
						await db
							.update(recommendationRuns)
							.set({ status: 'skipped', skipReason: 'unchanged-input', finishedAt: new Date() })
							.where(eq(recommendationRuns.id, run.id))
						return { status: 'skipped', runId: run.id, reason: 'unchanged-input' }
					}
				}
			}

			const recCount = await persistBatch(db, userId, run.id, allOutputs, settings.intelligenceDryRun)

			if (allSteps.length > 0) {
				await db.insert(recommendationRunSteps).values(allSteps)
			}

			// Per-analyzer model calls trap their own errors into step rows
			// rather than throwing, so one bad analyzer doesn't poison the
			// rest. The run-level status stays binary (the run *completed*).
			// Admins read partial failures via the per-step ok/error/noop
			// breakdown surfaced in the runs table and the debug panel.
			const cost = estimateCostMicroUsd(totalIn, totalOut)
			await db
				.update(recommendationRuns)
				.set({
					status: 'success',
					finishedAt: new Date(),
					inputHash: combinedHash,
					tokensIn: totalIn,
					tokensOut: totalOut,
					estimatedCostMicroUsd: cost,
				})
				.where(eq(recommendationRuns.id, run.id))

			notifyForRun({ settings, run: { userId, runId: run.id, status: 'success', recCount } })
			return { status: 'success', runId: run.id, recCount }
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			await db
				.update(recommendationRuns)
				.set({ status: 'error', finishedAt: new Date(), error: msg })
				.where(eq(recommendationRuns.id, run.id))
			log.error({ err: msg, userId }, 'run failed')
			return { status: 'error', runId: run.id, error: msg }
		}
	} finally {
		await db.execute(sql`select pg_advisory_unlock(${lockKey})`)
	}
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function loadSettings(db: Database): Promise<AppSettings> {
	try {
		return await getAppSettings(db)
	} catch (err) {
		log.warn({ err: err instanceof Error ? err.message : String(err) }, 'failed to load settings; using defaults')
		return DEFAULT_APP_SETTINGS
	}
}

async function resolveModel(db: Database, settings: AppSettings): Promise<LanguageModel | null> {
	const ai = await resolveAiConfig(db)
	if (!ai.isValid) return null
	// `intelligenceModelOverride` swaps only the model id within the
	// globally-configured provider. Provider/apiKey/baseUrl always come
	// from the canonical AI config so secrets stay in one place.
	const modelOverride = settings.intelligenceModelOverride
	return createAiModel({
		providerType: ai.providerType.value!,
		apiKey: ai.apiKey.value!,
		model: modelOverride ?? ai.model.value!,
		baseUrl: ai.baseUrl.value,
	})
}

function stepRow(runId: string, analyzerId: string, step: AnalyzerStep): NewRecommendationRunStep {
	return {
		runId,
		analyzer: analyzerId,
		prompt: step.prompt ?? null,
		responseRaw: step.responseRaw ?? null,
		parsed: (step.parsed as Record<string, unknown> | null) ?? null,
		tokensIn: step.tokensIn ?? 0,
		tokensOut: step.tokensOut ?? 0,
		latencyMs: step.latencyMs,
		error: step.error ?? null,
	}
}

async function getLastSuccessHash(db: Database, userId: string): Promise<{ inputHash: string | null; finishedAt: Date | null } | null> {
	const rows = await db
		.select({ inputHash: recommendationRuns.inputHash, finishedAt: recommendationRuns.finishedAt })
		.from(recommendationRuns)
		.where(and(eq(recommendationRuns.userId, userId), eq(recommendationRuns.status, 'success')))
		.orderBy(sql`started_at desc`)
		.limit(1)
	return rows[0] ?? null
}

async function persistBatch(
	db: Database,
	userId: string,
	batchId: string,
	outputs: Array<AnalyzerRecOutput & { analyzerId: string; dependentId: string | null }>,
	dryRun: boolean
): Promise<number> {
	if (dryRun) return outputs.length

	// Build new rows with fingerprints; carry forward dismissed/applied
	// status from prior recs that share a fingerprint.
	const fps = outputs.map(o => ({
		...o,
		fingerprint: fingerprintFor({
			analyzerId: o.analyzerId,
			kind: o.kind,
			fingerprintTargets: o.fingerprintTargets,
			dependentId: o.dependentId,
		}),
	}))

	const prior =
		fps.length === 0
			? []
			: await db
					.select({
						fingerprint: recommendations.fingerprint,
						status: recommendations.status,
						dismissedAt: recommendations.dismissedAt,
					})
					.from(recommendations)
					.where(and(eq(recommendations.userId, userId)))

	const priorMap = new Map<string, { status: RecommendationStatus; dismissedAt: Date | null }>()
	for (const p of prior) priorMap.set(p.fingerprint, { status: p.status, dismissedAt: p.dismissedAt })

	const inserts: Array<NewRecommendation> = fps.map(o => {
		const carry = priorMap.get(o.fingerprint)
		const status: RecommendationStatus = carry?.status === 'dismissed' || carry?.status === 'applied' ? carry.status : 'active'
		return {
			userId,
			dependentId: o.dependentId,
			batchId,
			analyzerId: o.analyzerId,
			kind: o.kind,
			fingerprint: o.fingerprint,
			status,
			severity: o.severity,
			title: o.title,
			body: o.body,
			payload: payloadFor(o),
			dismissedAt: carry?.dismissedAt ?? null,
		}
	})

	// Compute the (fingerprint, subItemId) pairs that the new bundle set
	// will claim. Anything in `recommendation_sub_item_dismissals` for this
	// user whose pair is NOT in this set is now stale (the item left the
	// candidate set: was fixed, deleted, archived) and should be pruned so
	// the dismissals table doesn't accumulate forever.
	const liveDismissalKeys = new Set<string>()
	for (const o of fps) {
		if (!o.subItems) continue
		for (const sub of o.subItems) liveDismissalKeys.add(`${o.fingerprint}:${sub.id}`)
	}

	// Replace prior batch in a single transaction. Covers both the user's
	// own recs and any per-dependent recs in one shot so the suggestions
	// page never sees a half-rotated batch. The sub-item dismissals table
	// is pruned in the same transaction so a partial-failure can't leave
	// dangling rows.
	return await db.transaction(async tx => {
		await tx.delete(recommendations).where(eq(recommendations.userId, userId))
		if (inserts.length > 0) await tx.insert(recommendations).values(inserts)

		const existingDismissals = await tx
			.select({
				fingerprint: recommendationSubItemDismissals.fingerprint,
				subItemId: recommendationSubItemDismissals.subItemId,
			})
			.from(recommendationSubItemDismissals)
			.where(eq(recommendationSubItemDismissals.userId, userId))
		for (const d of existingDismissals) {
			if (!liveDismissalKeys.has(`${d.fingerprint}:${d.subItemId}`)) {
				await tx
					.delete(recommendationSubItemDismissals)
					.where(
						and(
							eq(recommendationSubItemDismissals.userId, userId),
							eq(recommendationSubItemDismissals.fingerprint, d.fingerprint),
							eq(recommendationSubItemDismissals.subItemId, d.subItemId)
						)
					)
			}
		}

		return inserts.length
	})
}

// ─── Subject resolution ─────────────────────────────────────────────────────

async function loadUserSubject(db: Database, userId: string): Promise<AnalyzerSubject> {
	const rows = await db.select({ name: users.name, image: users.image }).from(users).where(eq(users.id, userId)).limit(1)
	if (rows.length === 0) return { kind: 'user', name: 'You', image: null }
	const row = rows[0]
	return {
		kind: 'user',
		name: row.name ?? 'You',
		image: row.image ?? null,
	}
}

// Returns the dependents this user guardians who have at least one active
// non-giftideas list owned by the user. The list-presence filter avoids
// burning analyzer passes (and AI tokens) on dependents the user has
// added but never authored a list for.
async function loadDependentSubjects(
	db: Database,
	userId: string
): Promise<Array<{ kind: 'dependent'; id: string; name: string; image: string | null }>> {
	const guardianed = await db
		.select({ id: dependents.id, name: dependents.name, image: dependents.image, isArchived: dependents.isArchived })
		.from(dependentGuardianships)
		.innerJoin(dependents, eq(dependentGuardianships.dependentId, dependents.id))
		.where(eq(dependentGuardianships.guardianUserId, userId))

	const active = guardianed.filter(d => !d.isArchived)
	if (active.length === 0) return []

	const ids = active.map(d => d.id)
	const listRows = await db
		.selectDistinct({ subjectDependentId: lists.subjectDependentId })
		.from(lists)
		.where(
			and(eq(lists.ownerId, userId), eq(lists.isActive, true), inArray(lists.subjectDependentId, ids), sql`${lists.type} <> 'giftideas'`)
		)
	const withLists = new Set(listRows.map(r => r.subjectDependentId).filter((v): v is string => v !== null))
	return active.filter(d => withLists.has(d.id)).map(d => ({ kind: 'dependent' as const, id: d.id, name: d.name, image: d.image }))
}

function payloadFor(o: AnalyzerRecOutput): Record<string, unknown> {
	const candidate = {
		actions: o.actions,
		dismissDescription: o.dismissDescription,
		affected: o.affected,
		relatedLists: o.relatedLists,
		relatedItems: o.relatedItems,
		interaction: o.interaction,
		subItems: o.subItems,
		bundleNav: o.bundleNav,
	}
	// Validate analyzer output against the wire shape before persisting.
	// Catches analyzer regressions (typos, dropped fields, wrong intent
	// values) at insert time instead of letting them slip into recs.payload
	// where they'd surface as broken cards on the user-facing page.
	const result = recPayloadSchema.safeParse(candidate)
	if (!result.success) {
		log.warn(
			{ analyzerId: o.kind, issues: result.error.issues.slice(0, 5) },
			'rec payload failed schema validation; persisting raw shape (fix the analyzer)'
		)
	}
	return candidate
}

// Anthropic input/output token estimate. Production should use real
// per-model rates (resolved from ai-config) but this is good enough
// for the admin "cost / day" rollup until billing accuracy matters.
function estimateCostMicroUsd(tokensIn: number, tokensOut: number): number {
	// Sonnet-ish ballpark: $3/MTok in, $15/MTok out. Storing micro-USD
	// (USD * 1_000_000) avoids float drift on the integer column.
	const inCost = (tokensIn / 1_000_000) * 3
	const outCost = (tokensOut / 1_000_000) * 15
	return Math.round((inCost + outCost) * 1_000_000)
}
