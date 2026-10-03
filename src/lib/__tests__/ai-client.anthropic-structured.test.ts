// Structured calls to Claude models must use native structured output, never a
// forced tool choice.
//
// @ai-sdk/anthropic only knows the models in its own capability table. For a
// model it does not recognize it falls back to a JSON tool with a forced
// `tool_choice`, and the Claude 5 models reject that ("tool_choice: type
// "tool" and "any" are not supported for this model"). That broke every
// generateObject feature in production on 3.0.71. These tests drive our
// createAiModel and read the request it would send, so a downgrade or a
// provider change that brings the fallback back fails here first.

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createAiModel } from '../ai-client'

type CapturedBody = { tool_choice?: { type: string }; output_format?: unknown; output_config?: unknown }

async function captureStructuredRequest(model: string): Promise<CapturedBody> {
	const captured: { body?: CapturedBody } = {}
	vi.stubGlobal(
		'fetch',
		vi.fn((_url: string, init: { body: string }) => {
			captured.body = JSON.parse(init.body) as CapturedBody
			return Promise.resolve(new Response('{"type":"error","error":{"type":"api_error","message":"stub"}}', { status: 500 }))
		})
	)
	const languageModel = createAiModel({ providerType: 'anthropic', apiKey: 'test-key', model })
	if (typeof languageModel === 'string') throw new Error('expected a model instance')
	try {
		await languageModel.doGenerate({
			prompt: [{ role: 'user', content: [{ type: 'text', text: 'Suggest one gift.' }] }],
			responseFormat: {
				type: 'json',
				schema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'], additionalProperties: false },
			},
		} as never)
	} catch {
		// The stubbed response is an error; only the request matters here.
	}
	if (!captured.body) throw new Error('no request was sent')
	return captured.body
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('createAiModel: Anthropic structured output', () => {
	for (const model of ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1']) {
		it(`uses native structured output for ${model}, with no forced tool choice`, async () => {
			const body = await captureStructuredRequest(model)
			expect(body.tool_choice?.type).not.toBe('tool')
			expect(body.tool_choice?.type).not.toBe('any')
			expect(body.output_format ?? body.output_config).toBeDefined()
		})
	}
})
