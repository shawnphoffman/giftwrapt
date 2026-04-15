/**
 * Pure helpers for the gifted-items claim flow.
 *
 * The SUM(quantity) ≤ item.quantity invariant is enforced at the application
 * layer inside a SELECT-FOR-UPDATE transaction (see src/api/gifts.ts). The
 * computation itself is split out here so it's trivially unit-testable without
 * standing up a DB.
 */

export type ClaimForRemainingCalc = {
	quantity: number
	isArchived: boolean
}

/**
 * Remaining claimable quantity for an item, given its current claims.
 *
 * Archived claims don't count — the item is back up for grabs. Clamped to ≥0
 * so a somehow-over-claimed item (data drift, manual edit) reports 0 rather
 * than negative. Callers should treat a return value of 0 as "fully claimed".
 */
export function computeRemainingClaimableQuantity(itemQuantity: number, claims: ReadonlyArray<ClaimForRemainingCalc>): number {
	const claimed = claims.reduce((sum, c) => (c.isArchived ? sum : sum + c.quantity), 0)
	return Math.max(0, itemQuantity - claimed)
}
