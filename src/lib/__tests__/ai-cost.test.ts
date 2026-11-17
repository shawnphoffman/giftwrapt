// Admin-entered model prices (the `aiModelRates` setting, plan 34d).

import { describe, expect, it } from 'vitest'

import { estimateStepCostMicroUsd, hasKnownRate } from '@/lib/ai-cost'

const step = { tokensIn: 1_000_000, tokensOut: 1_000_000 }

describe('custom model rates', () => {
	it('costs a model with an entered rate at that rate', () => {
		const rates = { 'some-new-model': { inPerMTok: 0.1, outPerMTok: 0.4 } }
		expect(estimateStepCostMicroUsd('some-new-model', step, rates)).toBeCloseTo(500_000)
	})

	it('matches the model name whatever its case', () => {
		const rates = { 'Some-New-Model': { inPerMTok: 0.1, outPerMTok: 0.4 } }
		expect(estimateStepCostMicroUsd('some-new-model', step, rates)).toBeCloseTo(500_000)
	})

	it('lets an entered rate win over the built-in table', () => {
		const rates = { 'claude-haiku-4-5': { inPerMTok: 2, outPerMTok: 2 } }
		expect(estimateStepCostMicroUsd('claude-haiku-4-5', step, rates)).toBeCloseTo(4_000_000)
		expect(estimateStepCostMicroUsd('claude-haiku-4-5', step)).toBeCloseTo(6_000_000)
	})

	it('costs an unknown model with no entry as before', () => {
		expect(estimateStepCostMicroUsd('some-new-model', step, {})).toBeCloseTo(18_000_000)
		expect(estimateStepCostMicroUsd('some-new-model', step)).toBeCloseTo(18_000_000)
	})

	it('still discounts cached input at a custom rate', () => {
		const rates = { m: { inPerMTok: 10, outPerMTok: 0 } }
		expect(estimateStepCostMicroUsd('m', { tokensIn: 1_000_000, tokensOut: 0, cachedInputTokens: 1_000_000 }, rates)).toBeCloseTo(1_000_000)
	})

	it('knows which models have a real price', () => {
		expect(hasKnownRate('claude-sonnet-5-5')).toBe(true)
		expect(hasKnownRate('gpt-5-mini')).toBe(false)
		expect(hasKnownRate('gpt-5-mini', { 'gpt-5-mini': { inPerMTok: 1, outPerMTok: 2 } })).toBe(true)
	})
})
