import { describe, expect, it } from 'vitest'

import { evenUnitShare, parseTotalCost, unitContribution, unitCount } from '../contributions'

describe('parseTotalCost', () => {
	it('parses valid non-negative amounts', () => {
		expect(parseTotalCost('110')).toBe(110)
		expect(parseTotalCost('12.50')).toBe(12.5)
		expect(parseTotalCost('0')).toBe(0)
		expect(parseTotalCost(' 42 ')).toBe(42)
	})

	it('returns null for missing / empty / invalid / negative values', () => {
		expect(parseTotalCost(null)).toBeNull()
		expect(parseTotalCost(undefined)).toBeNull()
		expect(parseTotalCost('')).toBeNull()
		expect(parseTotalCost('   ')).toBeNull()
		expect(parseTotalCost('abc')).toBeNull()
		expect(parseTotalCost('-5')).toBeNull()
	})
})

describe('unitCount', () => {
	it('is 1 (primary only) with no co-gifters', () => {
		expect(unitCount(null)).toBe(1)
		expect(unitCount(undefined)).toBe(1)
		expect(unitCount([])).toBe(1)
	})

	it('adds one unit per stored co-gifter id', () => {
		expect(unitCount(['a'])).toBe(2)
		expect(unitCount(['a', 'b'])).toBe(3)
	})
})

describe('evenUnitShare', () => {
	it('splits evenly when the total divides cleanly', () => {
		// $110, 2 units -> $55 each.
		expect(evenUnitShare('110', 2, true)).toBe(55)
		expect(evenUnitShare('110', 2, false)).toBe(55)
	})

	it('gives the primary the whole amount when there are no co-gifters', () => {
		expect(evenUnitShare('110', 1, true)).toBe(110)
	})

	it('puts the rounding remainder on the primary unit so shares sum to the total', () => {
		// $100 / 3 -> primary 33.34, co-gifters 33.33 each. Sum = 100.00.
		const primary = evenUnitShare('100', 3, true)
		const coGifter = evenUnitShare('100', 3, false)
		expect(primary).toBe(33.34)
		expect(coGifter).toBe(33.33)
		expect(primary! + coGifter! * 2).toBeCloseTo(100, 10)
	})

	it('handles a small awkward total exactly', () => {
		// $10 / 3 -> 3.34 + 3.33 + 3.33 = 10.00
		expect(evenUnitShare('10', 3, true)).toBe(3.34)
		expect(evenUnitShare('10', 3, false)).toBe(3.33)
	})

	it('is $0 for every unit when the total is zero', () => {
		expect(evenUnitShare('0', 3, true)).toBe(0)
		expect(evenUnitShare('0', 3, false)).toBe(0)
	})

	it('returns null when there is no valid cost (the common no-price case)', () => {
		expect(evenUnitShare(null, 2, true)).toBeNull()
		expect(evenUnitShare('', 2, false)).toBeNull()
		expect(evenUnitShare('not-a-number', 2, true)).toBeNull()
	})

	it('returns null for a non-positive unit count', () => {
		expect(evenUnitShare('110', 0, true)).toBeNull()
	})
})

describe('unitContribution', () => {
	const base = { additionalGifterIds: ['co'], viewerGifterIds: ['primary'] as Array<string> }

	it('falls back to the even split when there are no custom rows', () => {
		// $110, primary + 1 co-gifter -> even $55.
		expect(unitContribution({ ...base, totalCost: '110', isPrimaryUnit: true, customRows: [] })).toBe(55)
		expect(unitContribution({ ...base, totalCost: '110', isPrimaryUnit: false, viewerGifterIds: ['co'], customRows: [] })).toBe(55)
	})

	it('gives the primary unit the residual under a custom split', () => {
		// $110 total, co-gifter pledged $40 -> primary covers $70.
		const customRows = [{ userId: 'co', amount: '40.00' }]
		expect(unitContribution({ ...base, totalCost: '110', isPrimaryUnit: true, customRows })).toBe(70)
	})

	it("gives a co-gifter unit its own stored amount (matched via the viewer's partner id)", () => {
		const customRows = [{ userId: 'co', amount: '40.00' }]
		// Viewer is the co-gifter's partner; the stored anchor is 'co'.
		expect(
			unitContribution({
				totalCost: '110',
				additionalGifterIds: ['co'],
				isPrimaryUnit: false,
				viewerGifterIds: ['someone', 'co'],
				customRows,
			})
		).toBe(40)
	})

	it('clamps the primary residual at 0 when co-gifters are over-pledged', () => {
		const customRows = [{ userId: 'co', amount: '80.00' }]
		expect(unitContribution({ ...base, totalCost: '50', isPrimaryUnit: true, customRows })).toBe(0)
	})

	it('returns 0 for a co-gifter unit not present in the custom rows', () => {
		const customRows = [{ userId: 'co', amount: '40.00' }]
		expect(
			unitContribution({
				totalCost: '110',
				additionalGifterIds: ['co', 'other'],
				isPrimaryUnit: false,
				viewerGifterIds: ['other'],
				customRows,
			})
		).toBe(0)
	})

	it('returns null when there is no valid cost', () => {
		expect(unitContribution({ ...base, totalCost: null, isPrimaryUnit: true, customRows: [{ userId: 'co', amount: '40' }] })).toBeNull()
	})
})
