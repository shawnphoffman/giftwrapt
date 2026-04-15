import { describe, expect, it } from 'vitest'

import { computeRemainingClaimableQuantity } from '../gifts'

describe('computeRemainingClaimableQuantity', () => {
	it('returns the full quantity when there are no claims', () => {
		expect(computeRemainingClaimableQuantity(3, [])).toBe(3)
	})

	it('subtracts non-archived claim quantities', () => {
		expect(
			computeRemainingClaimableQuantity(5, [
				{ quantity: 2, isArchived: false },
				{ quantity: 1, isArchived: false },
			])
		).toBe(2)
	})

	it('ignores archived claims — an archived claim frees the slot', () => {
		expect(
			computeRemainingClaimableQuantity(3, [
				{ quantity: 2, isArchived: true },
				{ quantity: 1, isArchived: false },
			])
		).toBe(2)
	})

	it('returns 0 when all quantity is claimed', () => {
		expect(
			computeRemainingClaimableQuantity(2, [
				{ quantity: 1, isArchived: false },
				{ quantity: 1, isArchived: false },
			])
		).toBe(0)
	})

	it('clamps to 0 if somehow over-claimed (data drift, manual edits)', () => {
		expect(computeRemainingClaimableQuantity(1, [{ quantity: 2, isArchived: false }])).toBe(0)
	})
})
