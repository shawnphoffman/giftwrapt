import { describe, expect, it } from 'vitest'

import { estimateStepCostMicroUsd } from '../runner'

describe('estimateStepCostMicroUsd', () => {
	it('prices by model-name substring', () => {
		const step = { tokensIn: 1_000_000, tokensOut: 1_000_000, cachedInputTokens: 0 }
		// haiku: $1 in + $5 out
		expect(estimateStepCostMicroUsd('claude-haiku-4-5', step)).toBe(6_000_000)
		// sonnet: $3 in + $15 out
		expect(estimateStepCostMicroUsd('claude-sonnet-5', step)).toBe(18_000_000)
		// opus: $5 in + $25 out
		expect(estimateStepCostMicroUsd('claude-opus-5', step)).toBe(30_000_000)
	})

	it('falls back to sonnet-ish rates for unknown or missing model names', () => {
		const step = { tokensIn: 1_000_000, tokensOut: 0, cachedInputTokens: 0 }
		expect(estimateStepCostMicroUsd('gpt-something', step)).toBe(3_000_000)
		expect(estimateStepCostMicroUsd(null, step)).toBe(3_000_000)
	})

	it('discounts cached input tokens to a tenth of the input rate', () => {
		// 1M input, all cached, haiku: 1M * $1 * 0.1 = $0.10
		expect(estimateStepCostMicroUsd('claude-haiku-4-5', { tokensIn: 1_000_000, tokensOut: 0, cachedInputTokens: 1_000_000 })).toBeCloseTo(
			100_000,
			5
		)
	})

	it('clamps cached counts to tokensIn so a misreporting provider cannot go negative', () => {
		const cost = estimateStepCostMicroUsd('claude-haiku-4-5', { tokensIn: 100, tokensOut: 0, cachedInputTokens: 5_000 })
		expect(cost).toBeGreaterThan(0)
	})

	it('treats missing token fields as zero', () => {
		expect(estimateStepCostMicroUsd('claude-haiku-4-5', { latencyMs: 5 } as never)).toBe(0)
	})
})
