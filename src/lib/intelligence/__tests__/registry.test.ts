import { describe, expect, it } from 'vitest'

import { ANALYZERS, isAnalyzerEnabled } from '../registry'

describe('analyzer registry', () => {
	it('lists v1 analyzers', () => {
		const ids = ANALYZERS.map(a => a.id)
		expect(ids).toEqual(['primary-list', 'stale-items', 'duplicates'])
	})

	it('respects per-analyzer enable overrides', () => {
		const a = ANALYZERS[0]
		expect(isAnalyzerEnabled(a, undefined)).toBe(true) // default
		expect(isAnalyzerEnabled(a, {})).toBe(true) // empty override map -> default
		expect(isAnalyzerEnabled(a, { [a.id]: false })).toBe(false)
		expect(isAnalyzerEnabled(a, { [a.id]: true })).toBe(true)
		// other ids in the map don't affect this analyzer
		expect(isAnalyzerEnabled(a, { 'some-other': false })).toBe(true)
	})
})
