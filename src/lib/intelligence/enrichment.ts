import { type LanguageModel } from 'ai'
import { and, eq, gt, inArray, isNotNull, isNull, lt, ne, or } from 'drizzle-orm'

import type { Database } from '@/db'
import { itemAiAnalysis, items, lists, type NewItemAiAnalysis } from '@/db/schema'
import { visibleItemsWhere } from '@/lib/item-visibility'

import { composeForLog, generateObjectCached } from './ai-call'
import { sha256Hex } from './hash'
import {
	buildEnrichmentUserPrompt,
	ENRICHMENT_CATEGORIES,
	ENRICHMENT_SYSTEM,
	type EnrichmentCandidate,
	enrichmentResponseSchema,
	MAX_SUGGESTED_OPTIONS,
} from './prompts/enrichment'
import type { AnalyzerStep } from './types'

// Bump when the extraction prompt/schema changes in a way that should
// re-enrich existing rows. The sweep re-selects older rows lazily,
// bounded by MAX_ITEMS_PER_RUN, so a bump backfills over a few cron
// cycles instead of one burst.
export const ANALYSIS_VERSION = 1

// Per-user, per-run ceiling on items sent for enrichment. Large libraries
// converge over successive runs; steady-state runs only process deltas.
const MAX_ITEMS_PER_RUN = 200

// Items per model call. One batched call amortizes the instruction block
// across many items; small enough that a single parse failure doesn't
// waste the whole sweep.
const BATCH_SIZE = 40

const CATEGORY_SET = new Set<string>(ENRICHMENT_CATEGORIES)

// Hash of the enrichment inputs. An item whose hash matches its stored
// analysis row needs no model call regardless of `modifiedAt` churn.
export function contentHashFor(title: string, notes: string | null, url: string | null): string {
	return sha256Hex(`enrich|${title}|${notes ?? ''}|${url ?? ''}`)
}

export type EnrichmentRunResult = {
	steps: Array<AnalyzerStep>
	// Items that went through a model call this run.
	analyzed: number
	// Items whose stored analysis was already current (touched, no call).
	current: number
}

// Ensure the user's items have current analysis rows. Selection is a
// self-healing sweep, not a queue: an item qualifies when it has no
// analysis row, its row predates an item edit (`items.modifiedAt` is
// bumped by server actions on title/url/notes changes), or the row was
// produced by an older ANALYSIS_VERSION. `modifiedAt` over-selects no-op
// edits, so rows whose content hash is actually unchanged are just
// touched (updatedAt bump) to fall out of the next sweep.
export async function runEnrichment(args: {
	db: Database
	userId: string
	model: LanguageModel
	modelName: string | null
	logger: { warn: (...a: Array<unknown>) => void }
	now: Date
}): Promise<EnrichmentRunResult> {
	const { db, userId, model, now } = args
	const t0 = Date.now()

	const rows = await db
		.select({
			itemId: items.id,
			title: items.title,
			notes: items.notes,
			url: items.url,
			storedHash: itemAiAnalysis.contentHash,
			storedVersion: itemAiAnalysis.analysisVersion,
		})
		.from(items)
		.innerJoin(lists, eq(items.listId, lists.id))
		.leftJoin(itemAiAnalysis, eq(itemAiAnalysis.itemId, items.id))
		.where(
			and(
				eq(lists.ownerId, userId),
				eq(lists.isActive, true),
				ne(lists.type, 'giftideas'),
				ne(lists.type, 'todos'),
				visibleItemsWhere('visible'),
				or(
					isNull(itemAiAnalysis.itemId),
					lt(itemAiAnalysis.analysisVersion, ANALYSIS_VERSION),
					and(isNotNull(items.modifiedAt), gt(items.modifiedAt, itemAiAnalysis.updatedAt))
				)
			)
		)
		.limit(MAX_ITEMS_PER_RUN)

	const steps: Array<AnalyzerStep> = []

	// Split "content actually changed" from "modifiedAt churn / no-op edit".
	const needsModel: Array<(typeof rows)[number] & { hash: string }> = []
	const currentIds: Array<number> = []
	for (const row of rows) {
		const hash = contentHashFor(row.title, row.notes, row.url)
		if (row.storedHash === hash && (row.storedVersion ?? 0) >= ANALYSIS_VERSION) {
			currentIds.push(row.itemId)
		} else {
			needsModel.push({ ...row, hash })
		}
	}

	if (currentIds.length > 0) {
		// Touch so the modifiedAt > updatedAt predicate stops re-selecting.
		await db.update(itemAiAnalysis).set({ updatedAt: now }).where(inArray(itemAiAnalysis.itemId, currentIds))
	}

	steps.push({
		name: 'enrichment:sweep',
		parsed: { selected: rows.length, needsModel: needsModel.length, alreadyCurrent: currentIds.length },
		latencyMs: Date.now() - t0,
	})

	let analyzed = 0
	for (let offset = 0; offset < needsModel.length; offset += BATCH_SIZE) {
		const batch = needsModel.slice(offset, offset + BATCH_SIZE)
		const byId = new Map(batch.map(b => [String(b.itemId), b]))
		const candidates: Array<EnrichmentCandidate> = batch.map(b => ({
			itemId: String(b.itemId),
			title: b.title,
			notes: b.notes,
		}))
		const userPrompt = buildEnrichmentUserPrompt({ candidates })

		const stepStart = Date.now()
		let parsed: unknown = null
		let responseRaw: string | null = null
		let error: string | null = null
		let tokensIn = 0
		let tokensOut = 0
		let cachedInputTokens = 0
		try {
			const result = await generateObjectCached({
				model,
				schema: enrichmentResponseSchema,
				system: ENRICHMENT_SYSTEM,
				prompt: userPrompt,
			})
			parsed = result.object
			responseRaw = JSON.stringify(result.object)
			tokensIn = result.usage.inputTokens
			tokensOut = result.usage.outputTokens
			cachedInputTokens = result.usage.cachedInputTokens
		} catch (err) {
			error = err instanceof Error ? err.message : String(err)
		}
		steps.push({
			name: `enrichment:batch-${offset / BATCH_SIZE + 1}`,
			prompt: composeForLog(ENRICHMENT_SYSTEM, userPrompt),
			responseRaw,
			parsed,
			tokensIn,
			tokensOut,
			cachedInputTokens,
			latencyMs: Date.now() - stepStart,
			error,
		})
		// A failed batch is retried on the next run (rows stay selected);
		// keep going so one bad batch doesn't starve the rest.
		if (error || !parsed) continue

		const aiItems = (parsed as { items: Array<Record<string, unknown>> }).items
		const upserts: Array<NewItemAiAnalysis> = []
		for (const ai of aiItems) {
			const src = byId.get(String(ai.itemId))
			// Ignore items the model invented; items it dropped simply stay
			// selected for the next sweep.
			if (!src) continue
			const isClothing = ai.isClothing === true
			const category = typeof ai.category === 'string' && CATEGORY_SET.has(ai.category) ? ai.category : 'other'
			const canonicalName =
				typeof ai.canonicalName === 'string' && ai.canonicalName.trim().length > 0
					? ai.canonicalName.trim().toLowerCase().slice(0, 300)
					: null
			upserts.push({
				itemId: src.itemId,
				contentHash: src.hash,
				analysisVersion: ANALYSIS_VERSION,
				model: args.modelName,
				category,
				canonicalName,
				isClothing,
				hasSize: isClothing && ai.hasSize === true,
				hasColor: isClothing && ai.hasColor === true,
				sizingRationale:
					isClothing && typeof ai.sizingRationale === 'string' && ai.sizingRationale.length > 0 ? ai.sizingRationale.slice(0, 500) : null,
				suggestedSizes: isClothing ? stringSlate(ai.suggestedSizes) : null,
				suggestedColors: isClothing ? stringSlate(ai.suggestedColors) : null,
				updatedAt: now,
			})
		}

		for (const row of upserts) {
			await db
				.insert(itemAiAnalysis)
				.values(row)
				.onConflictDoUpdate({
					target: itemAiAnalysis.itemId,
					set: {
						contentHash: row.contentHash,
						analysisVersion: row.analysisVersion,
						model: row.model,
						category: row.category,
						canonicalName: row.canonicalName,
						isClothing: row.isClothing,
						hasSize: row.hasSize,
						hasColor: row.hasColor,
						sizingRationale: row.sizingRationale,
						suggestedSizes: row.suggestedSizes,
						suggestedColors: row.suggestedColors,
						updatedAt: now,
					},
				})
		}
		analyzed += upserts.length
	}

	return { steps, analyzed, current: currentIds.length }
}

function stringSlate(value: unknown): Array<string> | null {
	if (!Array.isArray(value)) return null
	const cleaned = value
		.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
		.map(v => v.trim().slice(0, 60))
		.slice(0, MAX_SUGGESTED_OPTIONS)
	return cleaned.length > 0 ? cleaned : null
}
