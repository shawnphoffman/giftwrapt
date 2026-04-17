import { describe, expect, it } from 'vitest'

import { computeListItemCounts, computeRemainingClaimableQuantity, computeRemainingClaimableQuantityExcluding } from '../gifts'

describe('computeRemainingClaimableQuantity', () => {
	it('returns the full quantity when there are no claims', () => {
		expect(computeRemainingClaimableQuantity(3, [])).toBe(3)
	})

	it('subtracts claim quantities', () => {
		expect(computeRemainingClaimableQuantity(5, [{ quantity: 2 }, { quantity: 1 }])).toBe(2)
	})

	it('returns 0 when all quantity is claimed', () => {
		expect(computeRemainingClaimableQuantity(2, [{ quantity: 1 }, { quantity: 1 }])).toBe(0)
	})

	it('clamps to 0 if somehow over-claimed (data drift, manual edits)', () => {
		expect(computeRemainingClaimableQuantity(1, [{ quantity: 2 }])).toBe(0)
	})
})

describe('computeRemainingClaimableQuantityExcluding', () => {
	it('frees the excluded claim back into the budget', () => {
		// item qty=5, two claims taking 3 total. Editing the qty=2 claim means
		// the editor can spend up to 5 - 1 (the other claim) = 4.
		expect(
			computeRemainingClaimableQuantityExcluding(
				5,
				[
					{ id: 10, quantity: 1 },
					{ id: 11, quantity: 2 },
				],
				11
			)
		).toBe(4)
	})

	it('returns the full quantity when excluding the only claim', () => {
		expect(computeRemainingClaimableQuantityExcluding(3, [{ id: 1, quantity: 3 }], 1)).toBe(3)
	})

	it('no-ops when the exclude id is not present', () => {
		// Nothing to exclude → falls through to regular behaviour.
		expect(
			computeRemainingClaimableQuantityExcluding(
				4,
				[
					{ id: 1, quantity: 1 },
					{ id: 2, quantity: 2 },
				],
				999
			)
		).toBe(1)
	})
})

describe('computeListItemCounts', () => {
	it('returns zeros for an empty list', () => {
		expect(computeListItemCounts([])).toEqual({ total: 0, unclaimed: 0 })
	})

	it('counts every non-archived item without any claims as unclaimed', () => {
		const items = [
			{ isArchived: false, quantity: 1, gifts: [] },
			{ isArchived: false, quantity: 3, gifts: [] },
		]
		expect(computeListItemCounts(items)).toEqual({ total: 2, unclaimed: 2 })
	})

	it('treats fully claimed items as claimed (not in unclaimed count)', () => {
		const items = [
			{ isArchived: false, quantity: 1, gifts: [{ quantity: 1 }] },
			{ isArchived: false, quantity: 2, gifts: [{ quantity: 1 }, { quantity: 1 }] },
			{ isArchived: false, quantity: 1, gifts: [] },
		]
		expect(computeListItemCounts(items)).toEqual({ total: 3, unclaimed: 1 })
	})

	it('treats partially claimed items as unclaimed', () => {
		// Still has remaining capacity, so it shows up in the "unclaimed" badge.
		const items = [{ isArchived: false, quantity: 3, gifts: [{ quantity: 1 }] }]
		expect(computeListItemCounts(items)).toEqual({ total: 1, unclaimed: 1 })
	})

	it('excludes archived items from both counts', () => {
		const items = [
			{ isArchived: true, quantity: 1, gifts: [] },
			{ isArchived: true, quantity: 1, gifts: [{ quantity: 1 }] },
			{ isArchived: false, quantity: 1, gifts: [] },
		]
		expect(computeListItemCounts(items)).toEqual({ total: 1, unclaimed: 1 })
	})
})
