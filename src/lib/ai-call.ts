// The one place the app calls a model. Every feature goes through
// `aiGenerateObject` / `aiGenerateText` so that each call:
//
// - is labelled with the feature that made it,
// - writes one row to the `ai_usage` ledger (tokens, estimated cost,
//   latency, outcome), success or failure, and
// - can carry the admin's `maxOutputTokens` cap.
//
// `ai-call.static.test.ts` fails if anything else imports `generateText`
// or `generateObject` from the SDK, so a new AI feature cannot spend money
// the admin page does not show.
//
// The ledger never stores prompt or response text. A failed ledger write
// is logged and swallowed: accounting must not break the feature.
//
// Budget: when the admin sets `aiMonthlyCostCeilingUsd`, a call is refused
// with `AiBudgetExceededError` once the month's estimated spend reaches
// it. The check reads a short-lived cached total, so a burst can overshoot
// by a few calls; it is a guard rail, not a billing control.

import { generateObject, generateText, type LanguageModel, type ModelMessage } from 'ai'
import type { z } from 'zod'

import { db as defaultDb, type SchemaDatabase } from '@/db'
import { aiUsage } from '@/db/schema'
import { estimateStepCostMicroUsd } from '@/lib/ai-cost'
import { getMonthToDateCostMicroUsd } from '@/lib/ai-usage'
import { createLogger } from '@/lib/logger'
import { getAppSettings } from '@/lib/settings-loader'

const log = createLogger('ai-call')

export const AI_FEATURES = ['scrape-provider', 'clean-title', 'photo-extract', 'intelligence', 'admin-test'] as const
export type AiFeature = (typeof AI_FEATURES)[number]

// Where a call was started from. 'web' is the app's own UI; 'import' is
// the background scrape queue that fills in imported items.
export const AI_CALL_SOURCES = ['web', 'mcp', 'mobile', 'import', 'cron', 'admin', 'cli'] as const
export type AiCallSource = (typeof AI_CALL_SOURCES)[number]

export type AiCallMeta = {
	feature: AiFeature
	source?: AiCallSource
	// Who the call is for. Omit for calls with no user in scope.
	userId?: string | null
	// The caller's database handle. Pass it whenever the caller is (or may
	// be) inside a transaction: the ledger write then runs in a savepoint on
	// that transaction instead of on a second connection, and a failed write
	// rolls back only the savepoint. Defaults to the app's connection.
	db?: SchemaDatabase
	// Skip the monthly ceiling. Only the admin connection test sets this, so
	// an admin can still verify the provider after the ceiling is hit.
	bypassBudget?: boolean
}

export class AiBudgetExceededError extends Error {
	readonly code = 'ai-budget-exceeded'
	constructor() {
		super('The AI budget for this month has been reached.')
		this.name = 'AiBudgetExceededError'
	}
}

const BUDGET_CACHE_MS = 60_000
let budgetCache: { at: number; exceeded: boolean } | null = null

export function _resetAiBudgetCacheForTesting(): void {
	budgetCache = null
}

// Fails open: if the settings or the ledger cannot be read, the call goes
// ahead. A broken guard rail must not take the feature down with it.
async function isOverBudget(dbx: SchemaDatabase): Promise<boolean> {
	const nowMs = Date.now()
	if (budgetCache && nowMs - budgetCache.at < BUDGET_CACHE_MS) return budgetCache.exceeded
	let exceeded = false
	try {
		const settings = await getAppSettings(dbx)
		const ceiling = settings.aiMonthlyCostCeilingUsd
		if (ceiling !== null) {
			const spent = await getMonthToDateCostMicroUsd(dbx, new Date(nowMs))
			exceeded = spent >= ceiling * 1_000_000
		}
	} catch (err) {
		log.warn({ err: err instanceof Error ? err.message : String(err) }, 'ai budget check failed; allowing the call')
	}
	budgetCache = { at: nowMs, exceeded }
	return exceeded
}

export type AiCallUsage = {
	inputTokens: number
	outputTokens: number
	cachedInputTokens: number
}

type BaseParams = {
	model: LanguageModel
	system?: string
	prompt?: string
	messages?: Array<ModelMessage>
	abortSignal?: AbortSignal
	maxOutputTokens?: number
}

export type AiGenerateObjectParams<TSchema extends z.ZodType> = BaseParams & { schema: TSchema }

export function modelNameOf(model: LanguageModel): string {
	return typeof model === 'string' ? model : model.modelId
}

function readUsage(usage: unknown): AiCallUsage {
	// The SDK guarantees these at runtime; the optional chains keep tests
	// that mock a partial `usage` from blowing up.
	const u = (usage ?? {}) as { inputTokens?: number; outputTokens?: number; inputTokenDetails?: { cacheReadTokens?: number } }
	return {
		inputTokens: u.inputTokens ?? 0,
		outputTokens: u.outputTokens ?? 0,
		cachedInputTokens: u.inputTokenDetails?.cacheReadTokens ?? 0,
	}
}

async function recordAiUsage(args: {
	meta: AiCallMeta
	model: string
	usage: AiCallUsage
	latencyMs: number
	outcome: 'ok' | 'error'
}): Promise<void> {
	const dbx = args.meta.db ?? (defaultDb as SchemaDatabase)
	try {
		// A nested transaction is a savepoint: if the insert fails inside a
		// caller's transaction, only the savepoint is rolled back and the
		// caller's work survives.
		await dbx.transaction(tx =>
			tx.insert(aiUsage).values({
				feature: args.meta.feature,
				model: args.model,
				userId: args.meta.userId ?? null,
				source: args.meta.source ?? null,
				tokensIn: args.usage.inputTokens,
				tokensOut: args.usage.outputTokens,
				cachedInputTokens: args.usage.cachedInputTokens,
				estimatedCostMicroUsd: Math.round(
					estimateStepCostMicroUsd(args.model, {
						tokensIn: args.usage.inputTokens,
						tokensOut: args.usage.outputTokens,
						cachedInputTokens: args.usage.cachedInputTokens,
					})
				),
				latencyMs: args.latencyMs,
				outcome: args.outcome,
			})
		)
	} catch (err) {
		log.warn({ err: err instanceof Error ? err.message : String(err), feature: args.meta.feature }, 'ai usage ledger write failed')
	}
}

const NO_USAGE: AiCallUsage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 }

async function tracked<T extends { usage: unknown }>(meta: AiCallMeta, model: LanguageModel, call: () => Promise<T>): Promise<T> {
	if (!meta.bypassBudget && (await isOverBudget(meta.db ?? (defaultDb as SchemaDatabase)))) {
		log.warn({ feature: meta.feature }, 'ai call refused: monthly budget reached')
		throw new AiBudgetExceededError()
	}
	const started = Date.now()
	const name = modelNameOf(model)
	try {
		const result = await call()
		await recordAiUsage({ meta, model: name, usage: readUsage(result.usage), latencyMs: Date.now() - started, outcome: 'ok' })
		return result
	} catch (err) {
		await recordAiUsage({ meta, model: name, usage: NO_USAGE, latencyMs: Date.now() - started, outcome: 'error' })
		throw err
	}
}

export async function aiGenerateObject<TSchema extends z.ZodType>(
	meta: AiCallMeta,
	params: AiGenerateObjectParams<TSchema>
): Promise<{ object: z.infer<TSchema>; usage: AiCallUsage }> {
	const result = await tracked(meta, params.model, () => generateObject(params as Parameters<typeof generateObject>[0]))
	return { object: result.object as z.infer<TSchema>, usage: readUsage(result.usage) }
}

export async function aiGenerateText(meta: AiCallMeta, params: BaseParams): Promise<{ text: string; usage: AiCallUsage }> {
	const result = await tracked(meta, params.model, () => generateText(params as Parameters<typeof generateText>[0]))
	return { text: result.text, usage: readUsage(result.usage) }
}
