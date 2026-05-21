import { generateObject, type LanguageModel } from 'ai'
import type { z } from 'zod'

// Centralized `generateObject` wrapper that splits each analyzer prompt
// into a STABLE system block + a VARIABLE user prompt. The system block
// is marked with Anthropic's `cache_control: ephemeral` so identical
// system prefixes across users within a 5-minute window are billed at
// the cached rate. OpenAI's automatic prefix caching kicks in for free
// on the same shape; openai-compatible providers ignore the hint.
//
// Why messages-based input: `generateObject({ system, prompt })` flattens
// to a system message but the AI SDK has no way to attach providerOptions
// to it. Using explicit messages lets us hang the cache_control hint on
// the right block without affecting non-Anthropic providers.
//
// Returns the same shape as `generateObject` plus a normalized
// `cachedInputTokens` field for observability. We pull it from the SDK's
// already-normalized `usage.inputTokenDetails.cacheReadTokens`.

export type GenerateObjectCachedArgs<TSchema extends z.ZodType> = {
	model: LanguageModel
	schema: TSchema
	system: string
	prompt: string
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

	const result = await generateObject({
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
	})

	// `inputTokenDetails` is guaranteed by the AI SDK at runtime, but the
	// optional chain keeps tests that mock generateObject with a partial
	// `usage` shape from blowing up on a missing nested field.
	const details = (result.usage as { inputTokenDetails?: { cacheReadTokens?: number } }).inputTokenDetails
	return {
		object: result.object as z.infer<TSchema>,
		usage: {
			inputTokens: result.usage.inputTokens ?? 0,
			outputTokens: result.usage.outputTokens ?? 0,
			cachedInputTokens: details?.cacheReadTokens ?? 0,
		},
	}
}

// Convenience for analyzers that want to persist the full composed
// prompt in the run-step log. Keeps debug surfaces unchanged when we
// transition from a single-string prompt to system/prompt split.
export function composeForLog(system: string, prompt: string): string {
	return `${system}\n\n${prompt}`
}
