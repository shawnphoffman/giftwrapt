import { MockLanguageModelV3 } from 'ai/test'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { composeForLog, generateObjectCached } from '../ai-call'

const schema = z.object({ answer: z.string() })

// V3 provider result shape: inputTokens/outputTokens are objects with
// breakdown fields; finishReason is `{ unified, raw }`. The AI SDK
// normalizes these into the flat `usage` we read in the helper.
function v3Result(opts: { answer?: string; inputTotal?: number; cacheRead?: number; outputTotal?: number }) {
	const inputTotal = opts.inputTotal ?? 100
	const cacheRead = opts.cacheRead ?? 0
	const outputTotal = opts.outputTotal ?? 5
	return {
		content: [{ type: 'text' as const, text: JSON.stringify({ answer: opts.answer ?? 'ok' }) }],
		usage: {
			inputTokens: {
				total: inputTotal,
				noCache: inputTotal - cacheRead,
				cacheRead,
				cacheWrite: 0,
			},
			outputTokens: { total: outputTotal, text: outputTotal, reasoning: 0 },
		},
		finishReason: { unified: 'stop' as const, raw: 'stop' },
		warnings: [],
	}
}

describe('generateObjectCached', () => {
	it('sends a system message marked with anthropic cacheControl and a user message holding the variable prompt', async () => {
		const captured: { prompt: unknown } = { prompt: null }
		const model = new MockLanguageModelV3({
			doGenerate: async args => {
				captured.prompt = args.prompt
				return v3Result({})
			},
		})

		const result = await generateObjectCached({
			model,
			schema,
			system: 'STABLE INSTRUCTIONS',
			prompt: 'variable user content',
		})

		expect(result.object).toEqual({ answer: 'ok' })

		const prompt = captured.prompt as Array<{
			role: string
			content: unknown
			providerOptions?: { anthropic?: { cacheControl?: { type: string } } }
		}>
		expect(Array.isArray(prompt)).toBe(true)
		const system = prompt.find(m => m.role === 'system')
		expect(system).toBeTruthy()
		// The whole point of the helper: a cacheControl hint must land on
		// the system message so prompt caching can hit the stable prefix.
		expect(system?.providerOptions?.anthropic?.cacheControl?.type).toBe('ephemeral')

		const user = prompt.find(m => m.role === 'user')
		expect(user).toBeTruthy()
		expect(JSON.stringify(user)).toContain('variable user content')
		expect(JSON.stringify(system)).toContain('STABLE INSTRUCTIONS')
	})

	it('returns 0 cachedInputTokens when the provider does not report any', async () => {
		const model = new MockLanguageModelV3({
			doGenerate: async () => v3Result({ inputTotal: 50, cacheRead: 0 }),
		})

		const result = await generateObjectCached({
			model,
			schema,
			system: 'sys',
			prompt: 'user',
		})

		expect(result.usage.cachedInputTokens).toBe(0)
	})

	it('surfaces cached prefix tokens from the SDK-normalized usage breakdown', async () => {
		const model = new MockLanguageModelV3({
			doGenerate: async () => v3Result({ inputTotal: 200, cacheRead: 180 }),
		})

		const result = await generateObjectCached({
			model,
			schema,
			system: 'sys',
			prompt: 'user',
		})

		expect(result.usage.cachedInputTokens).toBe(180)
	})
})

describe('composeForLog', () => {
	it('concatenates system and user prompt with a blank line separator', () => {
		expect(composeForLog('A', 'B')).toBe('A\n\nB')
	})
})
