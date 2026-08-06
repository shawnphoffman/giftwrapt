import { type LanguageModel } from 'ai'
import { and, eq, inArray, or, sql } from 'drizzle-orm'

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
import { intelligenceRunsCompletedTotal } from '@/lib/observability/metrics'
import { type AppSettings, DEFAULT_APP_SETTINGS } from '@/lib/settings'
import { getAppSettings } from '@/lib/settings-loader'

import type { AnalyzerContext, AnalyzerSubject } from './context'
import { runEnrichment } from './enrichment'
import { fingerprintFor } from './fingerprint'
import { combineHashes } from './hash'
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
}

// Main entry point. Same signature whether called from cron, the manual
// server function, the run-once CLI, or a long-lived worker.
export async function generateForUser(db: Database, userId: string, opts: GenerateForUserOptions): Promise<RunResult> {
	const result = await generateForUserInner(db, userId, opts)
	intelligenceRunsCompletedTotal.inc({ outcome: result.status })
	return result
}

async function generateForUserInner(db: Database, userId: string, opts: GenerateForUserOptions): Promise<RunResult> {
	const settings = await loadSettings(db)

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
		const { modelFor, modelNameFor } = await resolveModelFactory(db, settings)
		const now = new Date()

		// Prior per-scope input hashes from the last successful run, used to
		// let analyzers skip their model call when their candidate slice is
		// byte-identical. Carry-forward is bounded: once a scope's recs are
		// older than the retention sweep would tolerate, force a fresh pass.
		// The bound sits one refresh interval BELOW the rec retention window
		// so carried rows are always regenerated before the sweep (which
		// deletes recs by createdAt) could delete them out from under the
		// user.
		const lastSuccess = await getLastSuccessRun(db, userId)
		const carryMaxDays = Math.max(1, settings.intelligenceStaleRecRetentionDays - settings.intelligenceRefreshIntervalDays)
		const carryCutoffMs = now.getTime() - carryMaxDays * 86400000
		const priorScopeHashes = lastSuccess?.analyzerInputHashes ?? {}

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
			const carriedScopes: Array<CarriedScope> = []
			const newScopeHashes: Record<string, { hash: string; generatedAt: string }> = {}
			let totalIn = 0
			let totalOut = 0
			let costMicroUsd = 0

			// Enrichment pre-step: make sure per-item facets (category,
			// clothing flags, canonical name) are current BEFORE analyzers
			// read them. Facet extraction is the only model spend for
			// unchanged items' stable questions — analyzers consume the
			// stored rows. Failure here degrades gracefully: analyzers fall
			// back to whatever facet rows already exist.
			const enrichmentModel = modelFor('enrichment')
			const wantsEnrichment = ANALYZERS.some(
				a => (a.id === 'clothing-prefs' || a.id === 'duplicates') && isAnalyzerEnabled(a, settings.intelligencePerAnalyzerEnabled)
			)
			if (enrichmentModel && wantsEnrichment) {
				const enrichmentModelName = modelNameFor('enrichment')
				try {
					const enrichment = await runEnrichment({
						db,
						userId,
						model: enrichmentModel,
						modelName: enrichmentModelName,
						logger: log,
						now,
					})
					for (const step of enrichment.steps) {
						totalIn += step.tokensIn ?? 0
						totalOut += step.tokensOut ?? 0
						costMicroUsd += estimateStepCostMicroUsd(enrichmentModelName, step)
						allSteps.push(stepRow(run.id, 'enrichment', step, enrichmentModelName))
					}
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err)
					allSteps.push(errorStepRow(run.id, 'enrichment', msg))
					log.warn({ userId, err: msg }, 'enrichment threw; analyzers use existing facets')
				}
			}

			for (const pass of passes) {
				for (const analyzer of ANALYZERS) {
					if (!isAnalyzerEnabled(analyzer, settings.intelligencePerAnalyzerEnabled)) continue
					const scopeKey = `${pass.dependentId ?? 'self'}:${analyzer.id}`
					// Record index access lies at the type level: missing keys
					// return undefined at runtime. Cast so we branch correctly.
					const prior = priorScopeHashes[scopeKey] as { hash: string; generatedAt: string } | undefined
					const priorFresh = prior && Date.parse(prior.generatedAt) >= carryCutoffMs ? prior : null
					const analyzerModelName = modelNameFor(analyzer.id)
					// Per-analyzer model: each analyzer can be pinned to a
					// cheaper model via `intelligenceAnalyzerModels`. The
					// factory caches by model name so analyzers sharing an
					// override don't pay multiple createAiModel calls.
					const ctx: AnalyzerContext = {
						db,
						userId,
						model: modelFor(analyzer.id),
						settings,
						logger: log,
						now,
						candidateCap: settings.intelligenceCandidateCap,
						dryRun: settings.intelligenceDryRun,
						dependentId: pass.dependentId,
						subject: pass.subject,
						priorInputHash: priorFresh?.hash ?? null,
					}
					try {
						const result = await analyzer.run(ctx)
						// Tag the input-hash slice with the dependent scope so a
						// rec set that's identical "shape" but different scope
						// doesn't collide on the combined hash.
						inputHashSlices.push(result.inputHash ? `${pass.dependentId ?? 'self'}:${result.inputHash}` : result.inputHash)
						if (result.unchanged && result.inputHash) {
							// Inputs identical to the prior generation: keep the
							// scope's existing rec rows and copy the prior
							// generatedAt forward so the carry bound still
							// measures from the last REAL generation.
							carriedScopes.push({ analyzerId: analyzer.id, dependentId: pass.dependentId })
							newScopeHashes[scopeKey] = priorFresh ?? { hash: result.inputHash, generatedAt: now.toISOString() }
						} else if (result.inputHash) {
							newScopeHashes[scopeKey] = { hash: result.inputHash, generatedAt: now.toISOString() }
						}
						for (const rec of result.recs) {
							allOutputs.push({ ...rec, analyzerId: analyzer.id, dependentId: pass.dependentId })
						}
						for (const step of result.steps) {
							totalIn += step.tokensIn ?? 0
							totalOut += step.tokensOut ?? 0
							costMicroUsd += estimateStepCostMicroUsd(analyzerModelName, step)
							allSteps.push(stepRow(run.id, analyzer.id, step, analyzerModelName))
						}
					} catch (err) {
						const msg = err instanceof Error ? err.message : String(err)
						allSteps.push(errorStepRow(run.id, analyzer.id, msg))
						log.warn({ analyzer: analyzer.id, dependentId: pass.dependentId, err: msg }, 'analyzer threw; continuing')
					}
				}
			}

			const combinedHash = combineHashes(inputHashSlices)
			if (carriedScopes.length > 0) {
				log.info(
					{ userId, carried: carriedScopes.map(s => `${s.dependentId ?? 'self'}:${s.analyzerId}`) },
					'scopes carried forward unchanged'
				)
			}

			const recCount = await persistBatch(db, userId, run.id, allOutputs, settings.intelligenceDryRun, carriedScopes)

			if (allSteps.length > 0) {
				await db.insert(recommendationRunSteps).values(allSteps)
			}

			// Per-analyzer model calls trap their own errors into step rows
			// rather than throwing, so one bad analyzer doesn't poison the
			// rest. The run-level status stays binary (the run *completed*).
			// Admins read partial failures via the per-step ok/error/noop
			// breakdown surfaced in the runs table and the debug panel. A run
			// where every scope carried forward unchanged is still a success:
			// it verified the current rec set is up to date, at near-zero
			// token cost (visible as tokensIn/Out = 0).
			await db
				.update(recommendationRuns)
				.set({
					status: 'success',
					finishedAt: new Date(),
					inputHash: combinedHash,
					analyzerInputHashes: newScopeHashes,
					tokensIn: totalIn,
					tokensOut: totalOut,
					estimatedCostMicroUsd: Math.round(costMicroUsd),
				})
				.where(eq(recommendationRuns.id, run.id))

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

// Returns per-analyzer model pickers. Resolves the default model name
// from `intelligenceModelOverride ?? ai.model.value`, then layers
// `intelligenceAnalyzerModels[analyzerId]` on top when present (the
// enrichment pre-step resolves under the pseudo-analyzer id
// 'enrichment', so admins can pin it to a cheaper model the same way).
// Created `LanguageModel` instances are cached by model name within a
// single run so two analyzers pointing at the same override don't pay
// multiple createAiModel calls.
//
// `modelFor` returns null (and `modelNameFor` null) when no AI provider
// is configured, so analyzers uniformly bail to their heuristic-only
// branches.
export type ModelFactory = {
	modelFor: (analyzerId: string) => LanguageModel | null
	modelNameFor: (analyzerId: string) => string | null
}

export async function resolveModelFactory(db: Database, settings: AppSettings): Promise<ModelFactory> {
	const ai = await resolveAiConfig(db)
	if (!ai.isValid) return { modelFor: () => null, modelNameFor: () => null }

	const defaultModelName = settings.intelligenceModelOverride ?? ai.model.value!
	const cache = new Map<string, LanguageModel>()

	function makeFor(name: string): LanguageModel {
		const cached = cache.get(name)
		if (cached) return cached
		const built = createAiModel({
			providerType: ai.providerType.value!,
			apiKey: ai.apiKey.value!,
			model: name,
			baseUrl: ai.baseUrl.value,
		})
		cache.set(name, built)
		return built
	}

	function nameFor(analyzerId: string): string {
		// `Record<string, string>` lies at the type level: missing keys
		// return undefined at runtime. Cast so we can branch correctly.
		const perAnalyzer = (settings.intelligenceAnalyzerModels as Record<string, string | undefined>)[analyzerId]
		return perAnalyzer ?? defaultModelName
	}

	return {
		modelFor: analyzerId => makeFor(nameFor(analyzerId)),
		modelNameFor: nameFor,
	}
}

type CarriedScope = { analyzerId: string; dependentId: string | null }

function stepRow(runId: string, analyzerId: string, step: AnalyzerStep, model: string | null): NewRecommendationRunStep {
	return {
		runId,
		analyzer: analyzerId,
		prompt: step.prompt ?? null,
		responseRaw: step.responseRaw ?? null,
		parsed: (step.parsed as Record<string, unknown> | null) ?? null,
		// Only attribute a model to steps that actually consumed tokens;
		// load/sweep bookkeeping steps stay model-less.
		model: (step.tokensIn ?? 0) > 0 || (step.tokensOut ?? 0) > 0 ? model : null,
		tokensIn: step.tokensIn ?? 0,
		tokensOut: step.tokensOut ?? 0,
		cachedInputTokens: step.cachedInputTokens ?? 0,
		latencyMs: step.latencyMs,
		error: step.error ?? null,
	}
}

function errorStepRow(runId: string, analyzerId: string, error: string): NewRecommendationRunStep {
	return {
		runId,
		analyzer: analyzerId,
		prompt: null,
		responseRaw: null,
		parsed: null,
		model: null,
		tokensIn: 0,
		tokensOut: 0,
		cachedInputTokens: 0,
		latencyMs: 0,
		error,
	}
}

async function getLastSuccessRun(
	db: Database,
	userId: string
): Promise<{
	inputHash: string | null
	finishedAt: Date | null
	analyzerInputHashes: Record<string, { hash: string; generatedAt: string }> | null
} | null> {
	const rows = await db
		.select({
			inputHash: recommendationRuns.inputHash,
			finishedAt: recommendationRuns.finishedAt,
			analyzerInputHashes: recommendationRuns.analyzerInputHashes,
		})
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
	dryRun: boolean,
	carriedScopes: Array<CarriedScope>
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

	// Rotate the batch in a single transaction. Scopes that carried forward
	// unchanged keep their existing rows (original batchId and createdAt —
	// honest provenance for the admin history view); everything else is
	// deleted and replaced so the suggestions page never sees a
	// half-rotated batch. The sub-item dismissals table is pruned in the
	// same transaction so a partial failure can't leave dangling rows.
	return await db.transaction(async tx => {
		const carriedConds = carriedScopes.map(s =>
			and(
				eq(recommendations.analyzerId, s.analyzerId),
				s.dependentId === null ? sql`${recommendations.dependentId} is null` : eq(recommendations.dependentId, s.dependentId)
			)
		)
		await tx
			.delete(recommendations)
			.where(
				carriedConds.length === 0
					? eq(recommendations.userId, userId)
					: and(eq(recommendations.userId, userId), sql`not (${or(...carriedConds)})`)
			)
		if (inserts.length > 0) await tx.insert(recommendations).values(inserts)

		// Compute the (fingerprint, subItemId) pairs the CURRENT rec set
		// (fresh inserts + carried rows) claims, from the persisted
		// payloads. Anything in `recommendation_sub_item_dismissals` for
		// this user outside this set is now stale (the item left the
		// candidate set: was fixed, deleted, archived) and is pruned so the
		// dismissals table doesn't accumulate forever.
		const liveRows = await tx
			.select({ fingerprint: recommendations.fingerprint, payload: recommendations.payload })
			.from(recommendations)
			.where(eq(recommendations.userId, userId))
		const liveDismissalKeys = new Set<string>()
		for (const row of liveRows) {
			const subItems = (row.payload as { subItems?: Array<{ id: string }> }).subItems
			if (!Array.isArray(subItems)) continue
			for (const sub of subItems) liveDismissalKeys.add(`${row.fingerprint}:${sub.id}`)
		}

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

// Per-step cost estimate keyed off the model name that actually ran the
// step. Cached input tokens bill at roughly a tenth of the input rate on
// providers that support prefix caching, so they're discounted here too.
// The rate table matches on model-name substrings so it works across the
// provider-configurable model ids; unknown names fall back to a
// Sonnet-ish ballpark. Still an estimate — good enough for the admin
// "cost / day" rollup, not a billing source of truth.
const MODEL_RATES: Array<{ match: RegExp; inPerMTok: number; outPerMTok: number }> = [
	{ match: /haiku/i, inPerMTok: 1, outPerMTok: 5 },
	{ match: /sonnet/i, inPerMTok: 3, outPerMTok: 15 },
	{ match: /opus/i, inPerMTok: 5, outPerMTok: 25 },
]
const FALLBACK_RATE = { inPerMTok: 3, outPerMTok: 15 }
const CACHED_READ_MULTIPLIER = 0.1

export function estimateStepCostMicroUsd(
	model: string | null,
	step: Pick<AnalyzerStep, 'tokensIn' | 'tokensOut' | 'cachedInputTokens'>
): number {
	const tokensIn = step.tokensIn ?? 0
	const tokensOut = step.tokensOut ?? 0
	// Clamp: provider-reported cached counts are a subset of tokensIn, but
	// don't let a misreporting provider drive the estimate negative.
	const cachedIn = Math.min(step.cachedInputTokens ?? 0, tokensIn)
	const rate = (model && MODEL_RATES.find(r => r.match.test(model))) || FALLBACK_RATE
	const inCost = ((tokensIn - cachedIn) / 1_000_000) * rate.inPerMTok
	const cachedCost = (cachedIn / 1_000_000) * rate.inPerMTok * CACHED_READ_MULTIPLIER
	const outCost = (tokensOut / 1_000_000) * rate.outPerMTok
	// Micro-USD (USD * 1_000_000) avoids float drift on the integer column.
	return (inCost + cachedCost + outCost) * 1_000_000
}
