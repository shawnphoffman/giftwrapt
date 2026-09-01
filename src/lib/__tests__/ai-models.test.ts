import { describe, expect, it } from 'vitest'

import { isChatModelId, parseModelList } from '../ai-models'

describe('isChatModelId', () => {
	it('keeps chat models from the OpenAI catalogue', () => {
		for (const id of ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4o', 'o3', 'o4-mini', 'chatgpt-4o-latest']) {
			expect(isChatModelId('openai', id), id).toBe(true)
		}
	})

	it('drops the non-chat endpoints OpenAI mixes into /v1/models', () => {
		for (const id of [
			'text-embedding-3-small',
			'whisper-1',
			'tts-1-hd',
			'dall-e-3',
			'davinci-002',
			'babbage-002',
			'omni-moderation-latest',
			'gpt-4o-audio-preview',
			'gpt-4o-realtime-preview',
			'gpt-4o-transcribe',
			'gpt-4o-mini-tts',
			'gpt-image-1',
		]) {
			expect(isChatModelId('openai', id), id).toBe(false)
		}
	})

	it('leaves other providers unfiltered, since their lists are already chat-only', () => {
		expect(isChatModelId('anthropic', 'claude-sonnet-4-6')).toBe(true)
		expect(isChatModelId('openai-compatible', 'text-embedding-ada-002')).toBe(true)
	})
})

describe('parseModelList', () => {
	it('reads the shared OpenAI list shape', () => {
		const models = parseModelList('openai', {
			data: [
				{ id: 'gpt-5', created: 2 },
				{ id: 'gpt-4o', created: 1 },
			],
		})
		expect(models).toEqual([{ id: 'gpt-5' }, { id: 'gpt-4o' }])
	})

	it('sorts newest first, falling back to alphabetical without timestamps', () => {
		const withCreated = parseModelList('openai', {
			data: [
				{ id: 'old', created: 1 },
				{ id: 'new', created: 99 },
			],
		})
		expect(withCreated.map(m => m.id)).toEqual(['new', 'old'])

		const withoutCreated = parseModelList('anthropic', { data: [{ id: 'b' }, { id: 'a' }] })
		expect(withoutCreated.map(m => m.id)).toEqual(['a', 'b'])
	})

	it('picks up provider display names when they add something over the id', () => {
		expect(parseModelList('anthropic', { data: [{ id: 'claude-opus-4-7', display_name: 'Claude Opus 4.7' }] })).toEqual([
			{ id: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
		])
		expect(parseModelList('openai-compatible', { data: [{ id: 'openai/gpt-5', name: 'OpenAI: GPT-5' }] })).toEqual([
			{ id: 'openai/gpt-5', label: 'OpenAI: GPT-5' },
		])
		expect(parseModelList('openai-compatible', { data: [{ id: 'llama3.1:8b', name: 'llama3.1:8b' }] })).toEqual([{ id: 'llama3.1:8b' }])
	})

	it('tolerates junk instead of throwing at the admin', () => {
		expect(parseModelList('openai', {})).toEqual([])
		expect(parseModelList('openai', { data: 'nope' })).toEqual([])
		expect(parseModelList('openai', { data: [{ id: '' }, { id: 42 }, null, { nope: true }] })).toEqual([])
	})
})
