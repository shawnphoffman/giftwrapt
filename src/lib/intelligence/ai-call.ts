import type { LanguageModel } from 'ai'
import type { z } from 'zod'

import type { SchemaDatabase } from '@/db'
import { type AiCallSource, aiGenerateObject } from '@/lib/ai-call'

// Centralized `generateObject` wrapper that splits each analyzer prompt
// into a STABLE system block + a VARIABLE user prompt. The system block
// is marked with Anthropic's `cache_control: ephemeral` so identical
// system prefixes across users within a 5-minute window are billed at
// the cached rate. OpenAI's automatic prefix caching kicks in for free
// on the same shape; openai-compatible providers ignore the hint.
//
// CAVEAT: providers enforce a minimum cacheable prefix length (Anthropic:
// 1024 tokens on Sonnet-class models; more on some others). Our analyzer
// system blocks are a few hundred tokens, so in practice the hint is a
// silent no-op — expect `cachedInputTokens` to read 0 — unless a prompt
// grows past the threshold. Real savings come from not making the call
// at all (per-scope skip gate + enrichment store), not from caching.
//
// Why messages-based input: `generateObject({ system, prompt })` flattens
// to a system message but the AI SDK has no way to attach providerOptions
// to it. Using explicit messages lets us hang the cache_control hint on
// the right block without affecting non-Anthropic providers.
//
// Returns the object plus normalized usage (including `cachedInputTokens`).
// The call itself goes through `aiGenerateObject` in src/lib/ai-call.ts,
// which writes the usage ledger row.

export type GenerateObjectCachedArgs<TSchema extends z.ZodType> = {
	model: LanguageModel
	schema: TSchema
	system: string
	prompt: string
	// Who the run is for, recorded on the usage ledger row.
	userId?: string | null
	// The run's database handle, so the ledger write joins the caller's
	// transaction instead of opening a second connection.
	db?: SchemaDatabase
	// How the run was triggered (cron, a user's manual refresh, the CLI).
	source?: AiCallSource
}

export type GenerateObjectCachedResult<T> = {
	object: T
	usage: {
		inputTokens: number
		outputTokens: number
		cachedInputTokens: number
	}
}

export async function generateObjectCached<TSchema extends z.ZodType>(
	args: GenerateObjectCachedArgs<TSchema>
): Promise<GenerateObjectCachedResult<z.infer<TSchema>>> {
	const { model, schema, system, prompt } = args

	// No `maxOutputTokens` here on purpose: analyzers return one structured
	// object per batch, and a cap that truncates it yields invalid JSON and a
	// failed step. Batch size and `intelligenceCandidateCap` bound the output.
	const result = await aiGenerateObject(
		{ feature: 'intelligence', userId: args.userId ?? null, db: args.db, source: args.source },
		{
			model,
			schema,
			messages: [
				{
					role: 'system',
					content: system,
					providerOptions: {
						anthropic: { cacheControl: { type: 'ephemeral' } },
					},
				},
				{ role: 'user', content: prompt },
			],
		}
	)

	return { object: result.object, usage: result.usage }
}

// Convenience for analyzers that want to persist the full composed
// prompt in the run-step log. Keeps debug surfaces unchanged when we
// transition from a single-string prompt to system/prompt split.
export function composeForLog(system: string, prompt: string): string {
	return `${system}\n\n${prompt}`
}
