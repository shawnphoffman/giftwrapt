import { describe, expect, it } from 'vitest'

import { mergeModelOptions } from '../model-picker'

describe('mergeModelOptions', () => {
	const live = [{ id: 'claude-opus-5', label: 'Claude Opus 5' }, { id: 'claude-sonnet-4-6' }]
	const fallback = ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001']

	it('puts the live catalogue first and backfills from the curated list', () => {
		const out = mergeModelOptions({ models: live, fallbackModels: fallback, value: 'claude-opus-5' })
		expect(out.map(o => o.id)).toEqual(['claude-opus-5', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'])
		expect(out.map(o => o.origin)).toEqual(['live', 'live', 'fallback'])
	})

	it('keeps a saved model selectable after the provider retires it', () => {
		const out = mergeModelOptions({ models: live, fallbackModels: fallback, value: 'claude-3-opus-20240229' })
		expect(out.at(-1)).toEqual({ id: 'claude-3-opus-20240229', origin: 'saved' })
	})

	it('does not duplicate a saved model that is still listed', () => {
		const out = mergeModelOptions({ models: live, fallbackModels: fallback, value: 'claude-sonnet-4-6' })
		expect(out.filter(o => o.id === 'claude-sonnet-4-6')).toHaveLength(1)
	})

	it('falls back to the curated list alone when the provider is unreachable', () => {
		const out = mergeModelOptions({ models: [], fallbackModels: fallback, value: '' })
		expect(out.map(o => o.id)).toEqual(fallback)
	})
})
